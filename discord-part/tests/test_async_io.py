import asyncio
import threading

from utils.async_io import run_blocking


async def test_run_blocking_uses_a_worker_thread():
    event_loop_thread = threading.get_ident()
    worker_thread = await run_blocking(threading.get_ident)
    assert worker_thread != event_loop_thread


async def test_run_blocking_keeps_the_loop_responsive():
    started = threading.Event()
    release = threading.Event()

    def blocking():
        started.set()
        release.wait(timeout=1)
        return 42

    task = asyncio.create_task(run_blocking(blocking))
    while not started.is_set():
        await asyncio.sleep(0)
    marker = await asyncio.sleep(0, result="responsive")
    release.set()

    assert await task == 42
    assert marker == "responsive"
