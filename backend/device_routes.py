import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.db import get_db
from backend.models import Device, Payload, User
from backend.security import decrypt, encrypt, get_current_user

router = APIRouter()

class DeviceIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    pico_url: HttpUrl
    api_url: HttpUrl

class PayloadIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ''
    tags: list[str] = Field(default_factory=list)
    script_id: str | None = None

def serialize_device(x: Device):
    return {'id': x.id, 'name': x.name, 'pico_url': decrypt(x.pico_url_encrypted), 'api_url': decrypt(x.api_url_encrypted), 'status': x.status}

@router.get('/devices')
def devices(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [serialize_device(x) for x in db.scalars(select(Device)).all()]

@router.post('/devices', status_code=201)
def create_device(data: DeviceIn, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    device = Device(id='device-' + uuid.uuid4().hex, name=data.name, pico_url_encrypted=encrypt(str(data.pico_url)), api_url_encrypted=encrypt(str(data.api_url)))
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
    device.name = data.name; device.pico_url_encrypted = encrypt(str(data.pico_url)); device.api_url_encrypted = encrypt(str(data.api_url))
    db.commit(); db.refresh(device)
    return serialize_device(device)

@router.delete('/devices/{i}', status_code=204)
def delete_device(i: str, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    device = db.get(Device, i)
    if not device: raise HTTPException(404, 'Device not found')
    db.delete(device); db.commit()

@router.get('/payloads')
def payloads(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [x.__dict__ | {} for x in db.scalars(select(Payload)).all()]

@router.post('/payloads', status_code=201)
def create_payload(data: PayloadIn, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    payload = Payload(id='payload-' + uuid.uuid4().hex, **data.model_dump())
    db.add(payload); db.commit(); db.refresh(payload)
    return {'id': payload.id, **data.model_dump()}

@router.delete('/payloads/{i}', status_code=204)
def delete_payload(i: str, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    payload = db.get(Payload, i)
    if not payload: raise HTTPException(404, 'Payload not found')
    db.delete(payload); db.commit()
