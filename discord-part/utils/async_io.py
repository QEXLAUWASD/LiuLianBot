import asyncio
from functools import partial


async def run_blocking(function, /, *args, **kwargs):
    return await asyncio.to_thread(partial(function, *args, **kwargs))
