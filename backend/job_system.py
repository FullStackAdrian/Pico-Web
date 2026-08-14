import queue
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Lock
from typing import Any

from sqlalchemy import select

from backend.db import SessionLocal
from backend.models import Execution, Job, Script

TERMINAL_STATES = {"succeeded", "failed", "cancelled"}


def utcnow():
    return datetime.now(timezone.utc)


def serialize_job(job: Job) -> dict[str, Any]:
    return {
        "id": job.id,
        "script_id": job.script_id,
        "device_id": job.device_id,
        "status": job.status,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        "error": job.error,
    }


class JobEventHub:
    """Thread-safe fan-out for job lifecycle events."""

    def __init__(self):
        self._clients: dict[int, queue.Queue] = {}
        self._lock = Lock()

    def subscribe(self) -> queue.Queue:
        client_queue: queue.Queue = queue.Queue()
        with self._lock:
            self._clients[id(client_queue)] = client_queue
        return client_queue

    def unsubscribe(self, client_queue: queue.Queue) -> None:
        with self._lock:
            self._clients.pop(id(client_queue), None)

    def publish(self, event: dict[str, Any]) -> None:
        with self._lock:
            clients = tuple(self._clients.values())
        for client_queue in clients:
            client_queue.put(event)


class JobSystem:
    def __init__(self, max_workers: int = 4):
        self.executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="pico-job")
        self.futures: dict[str, Future] = {}
        self.events = JobEventHub()

    def enqueue(self, script_id: str, device_id: str | None = None) -> Job:
        with SessionLocal() as db:
            script = db.get(Script, script_id)
            if not script:
                raise ValueError("Script not found")
            job = Job(id="job-" + uuid.uuid4().hex, script_id=script_id, device_id=device_id, status="queued")
            db.add(job)
            db.commit()
            db.refresh(job)
            result = serialize_job(job)
        self.events.publish({"type": "job", "job_id": job.id, "status": "queued", "job": result})
        future = self.executor.submit(self._run, job.id)
        self.futures[job.id] = future
        return job

    def cancel(self, job_id: str) -> Job | None:
        with SessionLocal() as db:
            job = db.get(Job, job_id)
            if not job:
                return None
            if job.status in TERMINAL_STATES:
                return job
            future = self.futures.get(job_id)
            if future and future.cancel():
                job.status = "cancelled"
                job.finished_at = utcnow()
                db.commit()
                result = serialize_job(job)
            else:
                return job
        self.events.publish({"type": "job", "job_id": job_id, "status": "cancelled", "job": result})
        return job

    def _set_state(self, job_id: str, status: str, error: str | None = None):
        with SessionLocal() as db:
            job = db.get(Job, job_id)
            if not job:
                return None
            job.status = status
            if status == "running":
                job.started_at = utcnow()
            if status in TERMINAL_STATES:
                job.finished_at = utcnow()
            job.error = error
            db.commit()
            db.refresh(job)
            result = serialize_job(job)
        self.events.publish({"type": "job", "job_id": job_id, "status": status, "job": result})
        return job

    def _run(self, job_id: str):
        started = time.monotonic()
        self._set_state(job_id, "running")
        with SessionLocal() as db:
            job = db.get(Job, job_id)
            if not job:
                return
            script = db.get(Script, job.script_id)
            if not script:
                self._set_state(job_id, "failed", "Script not found")
                return
            execution = Execution(
                id="exec-" + uuid.uuid4().hex,
                job_id=job.id,
                script_id=script.id,
                script_name=script.name,
                device_id=job.device_id,
            )
            db.add(execution)
            db.commit()
        try:
            duration_ms = int((time.monotonic() - started) * 1000)
            with SessionLocal() as db:
                execution = db.scalar(select(Execution).where(Execution.job_id == job_id).order_by(Execution.started_at.desc()))
                if execution:
                    execution.duration_ms = duration_ms
                    execution.success = True
                    db.commit()
            self._set_state(job_id, "succeeded")
        except Exception as exc:
            with SessionLocal() as db:
                execution = db.scalar(select(Execution).where(Execution.job_id == job_id).order_by(Execution.started_at.desc()))
                if execution:
                    execution.success = False
                    execution.error = str(exc)
                    execution.duration_ms = int((time.monotonic() - started) * 1000)
                    db.commit()
            self._set_state(job_id, "failed", str(exc))


job_system = JobSystem()
