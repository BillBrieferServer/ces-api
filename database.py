import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

load_dotenv()

DATABASE_URL = (
    f"postgresql+asyncpg://"
    f"{os.getenv('DB_USER', 'quietimpact_user')}:{os.getenv('DB_PASSWORD', '')}"
    f"@{os.getenv('DB_HOST', '127.0.0.1')}:{os.getenv('DB_PORT', '5432')}"
    f"/{os.getenv('DB_NAME', 'qibrain')}"
)

engine = create_async_engine(DATABASE_URL, pool_size=5, max_overflow=5, pool_recycle=1800, pool_pre_ping=True)
async_session = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with async_session() as session:
        yield session
