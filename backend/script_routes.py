from datetime import datetime, timezone
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
router=APIRouter()
SCRIPTS={}; EXECUTIONS=[]
def now(): return datetime.now(timezone.utc).isoformat()
class ScriptIn(BaseModel):
    name:str=Field(min_length=1,max_length=160); content:str=''; tags:list[str]=[]; category:str='Uncategorized'
class ScriptUpdate(BaseModel):
    name:str|None=None; content:str|None=None; tags:list[str]|None=None; category:str|None=None
class ExecuteIn(BaseModel): device_id:str|None=None
def get(i):
    if i not in SCRIPTS: raise HTTPException(404,'Script not found')
    return SCRIPTS[i]
def create(data):
    i='script-'+uuid.uuid4().hex; t=now(); x={'id':i,'name':data.name,'content':data.content,'tags':data.tags,'category':data.category,'createdAt':t,'updatedAt':t,'source':'local'}; SCRIPTS[i]=x; return x
@router.get('/scripts')
def list_scripts(): return list(SCRIPTS.values())
@router.post('/scripts',status_code=201)
def create_script(data:ScriptIn): return create(data)
@router.post('/scripts/upload',status_code=201)
def upload_script(data:ScriptIn): return create(data)
@router.get('/scripts/{i}')
def get_script(i:str): return get(i)
@router.put('/scripts/{i}')
def update_script(i:str,data:ScriptUpdate):
    x=get(i); x.update(data.model_dump(exclude_none=True)); x['updatedAt']=now(); return x
@router.delete('/scripts/{i}',status_code=204)
def delete_script(i:str): get(i); del SCRIPTS[i]
@router.post('/scripts/{i}/execute',status_code=202)
def execute(i:str,data:ExecuteIn):
    x=get(i); e={'id':'exec-'+uuid.uuid4().hex,'script_id':i,'script_name':x['name'],'started_at':now(),'duration_ms':0,'success':True,'error':None,'device_id':data.device_id}; EXECUTIONS.insert(0,e); return e
@router.get('/executions')
def history(): return EXECUTIONS
