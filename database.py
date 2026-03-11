from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

DATABASE_URL = "postgresql+asyncpg://quietimpact_user:ezj9QfukEXaShHcBpqN92WM4KREvvlWA@127.0.0.1:5432/qibrain"

engine = create_async_engine(DATABASE_URL, pool_size=5, max_overflow=5)
async_session = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with async_session() as session:
        yield session
