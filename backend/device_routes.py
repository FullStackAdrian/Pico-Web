from fastapi import HTTPException
from pydantic import BaseModel, Field
from backend.script_routes import router
import uuid
DEVICES={}; PAYLOADS={}
class DeviceIn(BaseModel):
    name:str=Field(min_length=1,max_length=100); pico_url:str; api_url:str
class PayloadIn(BaseModel):
    name:str=Field(min_length=1,max_length=120); description:str=''; tags:list[str]=[]; script_id:str|None=None
@router.get('/devices')
def devices(): return list(DEVICES.values())
@router.post('/devices',status_code=201)
def create_device(data:DeviceIn):
    i='device-'+uuid.uuid4().hex; x={**data.model_dump(),'id':i,'status':'unknown'}; DEVICES[i]=x; return x
@router.get('/devices/{i}')
def get_device(i:str):
    if i not in DEVICES: raise HTTPException(404,'Device not found')
    return DEVICES[i]
@router.put('/devices/{i}')
def update_device(i:str,data:DeviceIn):
    if i not in DEVICES: raise HTTPException(404,'Device not found')
    DEVICES[i].update(data.model_dump()); return DEVICES[i]
@router.delete('/devices/{i}',status_code=204)
def delete_device(i:str):
    if i not in DEVICES: raise HTTPException(404,'Device not found')
    del DEVICES[i]
@router.get('/payloads')
def payloads(): return list(PAYLOADS.values())
@router.post('/payloads',status_code=201)
def create_payload(data:PayloadIn):
    i='payload-'+uuid.uuid4().hex; x={'id':i,**data.model_dump()}; PAYLOADS[i]=x; return x
@router.delete('/payloads/{i}',status_code=204)
def delete_payload(i:str):
    if i not in PAYLOADS: raise HTTPException(404,'Payload not found')
    del PAYLOADS[i]
