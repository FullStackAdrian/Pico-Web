from fastapi import HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from backend.script_routes import router, now
import hashlib, secrets
USERS={}; TOKENS=set()
class WifiIn(BaseModel): ssid:str=Field(min_length=1,max_length=32); password:str=Field(min_length=8,max_length=63)
class Credentials(BaseModel): username:str=Field(min_length=1,max_length=80); password:str=Field(min_length=8,max_length=256)
@router.post('/wifi/validate')
def wifi(data:WifiIn): return {'valid':True,'ssid':data.ssid}
@router.post('/wifi/configure')
def configure_wifi(data:WifiIn): return {'accepted':True,'ssid':data.ssid,'applied':False}
@router.post('/auth/register',status_code=201)
def register(data:Credentials):
    if data.username in USERS: raise HTTPException(409,'User already exists')
    USERS[data.username]=hashlib.sha256(data.password.encode()).hexdigest(); return {'username':data.username}
@router.post('/auth/login')
def login(data:Credentials):
    if USERS.get(data.username)!=hashlib.sha256(data.password.encode()).hexdigest(): raise HTTPException(401,'Invalid credentials')
    token=secrets.token_urlsafe(32); TOKENS.add(token); return {'token':token,'token_type':'bearer'}
@router.websocket('/ws')
async def websocket(websocket:WebSocket):
    await websocket.accept(); await websocket.send_json({'type':'connected','timestamp':now()})
    try:
        while True:
            message=await websocket.receive_json(); await websocket.send_json({'type':'ack','payload':message,'timestamp':now()})
    except WebSocketDisconnect: return
