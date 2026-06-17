import asyncio, asyncpg

async def main():
    conn = await asyncpg.connect("postgresql://postgres:Admin123@localhost:5432/quebec_realestate")
    cols = await conn.fetch(
        "SELECT column_name FROM information_schema.columns WHERE table_name='properties' ORDER BY ordinal_position"
    )
    print([r["column_name"] for r in cols])

    # Sample row
    row = await conn.fetchrow("SELECT * FROM properties WHERE score IS NOT NULL ORDER BY score DESC LIMIT 1")
    if row:
        for k, v in dict(row).items():
            if v is not None:
                print(f"  {k}: {v}")
    await conn.close()

asyncio.run(main())
