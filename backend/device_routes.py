import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from backend.db import get_db
from backend.models import Device, Payload, User
from backend.security import decrypt, encrypt, get_current_user

router = APIRouter()
HEARTBEAT_TIMEOUT = timedelta(seconds=90)

class DeviceIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    pico_url: HttpUrl
    api_url: HttpUrl
    group_name: str | None = Field(default=None, max_length=80)
    tags: list[str] = Field(default_factory=list, max_length=20)

class DevicePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    pico_url: HttpUrl | None = None
    api_url: HttpUrl | None = None
    group_name: str | None = Field(default=None, max_length=80)
    tags: list[str] | None = Field(default=None, max_length=20)

class HeartbeatIn(BaseModel):
    firmware: str | None = Field(default=None, max_length=64)
    uptime_seconds: int | None = Field(default=None, ge=0)
    free_memory: int | None = Field(default=None, ge=0)
    temperature_c: float | None = Field(default=None, ge=-50, le=150)
    wifi_rssi: int | None = Field(default=None, ge=-150, le=0)

class PayloadIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ''
    tags: list[str] = Field(default_factory=list)
    script_id: str | None = None

def _is_online(device: Device, now: datetime | None = None) -> bool:
    if not device.last_seen:
        return False
    now = now or datetime.now(timezone.utc)
    last_seen = device.last_seen
    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)
    return now - last_seen <= HEARTBEAT_TIMEOUT

def _status(device: Device, now: datetime | None = None) -> str:
    return 'online' if _is_online(device, now) else ('offline' if device.last_seen else 'unknown')

def serialize_device(x: Device, now: datetime | None = None):
    status = _status(x, now)
    return {
        'id': x.id,
        'name': x.name,
        'pico_url': decrypt(x.pico_url_encrypted),
        'api_url': decrypt(x.api_url_encrypted),
        'status': status,
        'group_name': x.group_name,
        'tags': x.tags or [],
        'last_seen': x.last_seen.isoformat() if x.last_seen else None,
        'firmware': x.firmware,
    }

def serialize_metrics(x: Device):
    metrics = dict(x.metrics or {})
    metrics['last_seen'] = x.last_seen.isoformat() if x.last_seen else None
    metrics['status'] = _status(x)
    metrics['firmware'] = x.firmware
    return metrics

def serialize_payload(x: Payload):
    return {'id': x.id, 'name': x.name, 'description': x.description, 'tags': x.tags, 'script_id': x.script_id}

def _validate_tags(tags: list[str]) -> list[str]:
    cleaned = []
    for tag in tags:
        value = tag.strip().lower()
        if value and value not in cleaned:
            cleaned.append(value)
    return cleaned

@router.get('/devices')
def devices(
    status: str | None = Query(default=None, pattern='^(online|offline|unknown)$'),
    group: str | None = None,
    tag: str | None = None,
    search: str | None = Query(default=None, max_length=100),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.scalars(select(Device).order_by(Device.name)).all()
    now = datetime.now(timezone.utc)
    result = []
    for device in rows:
        item = serialize_device(device, now)
        if status and item['status'] != status:
            continue
        if group and item['group_name'] != group:
            continue
        if tag and tag.lower() not in item['tags']:
            continue
        if search and search.lower() not in item['name'].lower() and search.lower() not in item['id'].lower():
            continue
        result.append(item)
    return result

@router.get('/devices/groups')
def device_groups(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [x for x in db.scalars(select(Device.group_name).where(Device.group_name.is_not(None)).distinct().order_by(Device.group_name)).all() if x]

@router.post('/devices', status_code=201)
def create_device(data: DeviceIn, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    device = Device(
        id='device-' + uuid.uuid4().hex,
        name=data.name,
        pico_url_encrypted=encrypt(str(data.pico_url)),
        api_url_encrypted=encrypt(str(data.api_url)),
        status='unknown',
        group_name=data.group_name.strip() if data.group_name else None,
        tags=_validate_tags(data.tags),
        metrics={},
    )
    db.add(device); db.commit(); db.refresh(device)
    return serialize_device(device)

@router.get('/devices/{i}')
def get_device(i: str, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    device = db.get(Device, i)
    if not device: raise HTTPException(404, 'Device not found')
    return serialize_device(device)

@router.put('/devices/{i}')
def update_device(i: str, data: DeviceIn, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    device = db.get(Device, i)
    if not device: raise HTTPException(404, 'Device not found')
    device.name = data.name
    device.pico_url_encrypted = encrypt(str(data.pico_url))
    device.api_url_encrypted = encrypt(str(data.api_url))
    device.group_name = data.group_name.strip() if data.group_name else None
    device.tags = _validate_tags(data.tags)
    db.commit(); db.refresh(device)
    return serialize_device(device)

@router.patch('/devices/{i}')
def patch_device(i: str, data: DevicePatch, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    device = db.get(Device, i)
    if not device: raise HTTPException(404, 'Device not found')
    changes = data.model_dump(exclude_unset=True)
    if 'name' in changes: device.name = changes['name']
    if 'pico_url' in changes and changes['pico_url'] is not None: device.pico_url_encrypted = encrypt(str(changes['pico_url']))
    if 'api_url' in changes and changes['api_url'] is not None: device.api_url_encrypted = encrypt(str(changes['api_url']))
    if 'group_name' in changes: device.group_name = changes['group_name'].strip() if changes['group_name'] else None
    if 'tags' in changes and changes['tags'] is not None: device.tags = _validate_tags(changes['tags'])
    db.commit(); db.refresh(device)
    return serialize_device(device)

@router.delete('/devices/{i}', status_code=204)
def delete_device(i: str, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    device = db.get(Device, i)
    if not device: raise HTTPException(404, 'Device not found')
    db.delete(device); db.commit()

@router.post('/devices/{i}/heartbeat')
def heartbeat(i: str, data: HeartbeatIn, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    device = db.get(Device, i)
    if not device: raise HTTPException(404, 'Device not found')
    now = datetime.now(timezone.utc)
    device.last_seen = now
    device.status = 'online'
    if data.firmware is not None: device.firmware = data.firmware
    device.metrics = {k: v for k, v in {
        'uptime_seconds': data.uptime_seconds,
        'free_memory': data.free_memory,
        'temperature_c': data.temperature_c,
        'wifi_rssi': data.wifi_rssi,
    }.items() if v is not None}
    db.commit(); db.refresh(device)
    return {'status': 'ok', 'device': serialize_device(device, now), 'metrics': serialize_metrics(device)}

@router.get('/devices/{i}/metrics')
def device_metrics(i: str, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    device = db.get(Device, i)
    if not device: raise HTTPException(404, 'Device not found')
    return serialize_metrics(device)

@router.get('/payloads')
def payloads(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [serialize_payload(x) for x in db.scalars(select(Payload)).all()]

@router.post('/payloads', status_code=201)
def create_payload(data: PayloadIn, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    payload = Payload(id='payload-' + uuid.uuid4().hex, **data.model_dump())
    db.add(payload); db.commit(); db.refresh(payload)
    return serialize_payload(payload)

@router.delete('/payloads/{i}', status_code=204)
def delete_payload(i: str, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    payload = db.get(Payload, i)
    if not payload: raise HTTPException(404, 'Payload not found')
    db.delete(payload); db.commit()
