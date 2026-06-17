"""Quick DB check — verify financial metrics are populated after pipeline run."""
import asyncio
import asyncpg


async def main():
    conn = await asyncpg.connect(
        "postgresql://postgres:Admin123@localhost:5432/quebec_realestate"
    )

    print("\n── Top 5 Properties by Score ─────────────────────────────────────────")
    rows = await conn.fetch("""
        SELECT full_address, asking_price, cap_rate, noi_annual, score,
               score_category, bedrooms_total, unit_count, sqft_total
        FROM properties
        WHERE score IS NOT NULL
        ORDER BY score DESC
        LIMIT 5
    """)
    for r in rows:
        addr = (r["full_address"] or "")[:40]
        print(
            f"  {addr:40} | "
            f"price=${r['asking_price']:>10,.0f} | "
            f"cap={r['cap_rate'] or 0:.1f}% | "
            f"noi=${r['noi_annual'] or 0:>8,.0f} | "
            f"score={r['score']:5.1f} | "
            f"{r['score_category']}"
        )

    print("\n── Coverage ───────────────────────────────────────────────────────────")
    total         = await conn.fetchval("SELECT COUNT(*) FROM properties")
    scored        = await conn.fetchval("SELECT COUNT(*) FROM properties WHERE score IS NOT NULL")
    has_cap       = await conn.fetchval("SELECT COUNT(*) FROM properties WHERE cap_rate IS NOT NULL")
    has_noi       = await conn.fetchval("SELECT COUNT(*) FROM properties WHERE noi_annual IS NOT NULL")
    has_grm       = await conn.fetchval("SELECT COUNT(*) FROM properties WHERE grm IS NOT NULL")
    has_cashflow  = await conn.fetchval("SELECT COUNT(*) FROM properties WHERE monthly_cash_flow IS NOT NULL")
    has_brief     = await conn.fetchval("SELECT COUNT(*) FROM properties WHERE ai_brief_en IS NOT NULL")

    def pct(n): return f"{n}/{total} ({100*n//total if total else 0}%)"

    print(f"  Total properties : {total}")
    print(f"  Scored           : {pct(scored)}")
    print(f"  Has cap_rate     : {pct(has_cap)}")
    print(f"  Has NOI          : {pct(has_noi)}")
    print(f"  Has GRM          : {pct(has_grm)}")
    print(f"  Has cash flow    : {pct(has_cashflow)}")
    print(f"  Has AI brief     : {pct(has_brief)}")

    avg_score = await conn.fetchval("SELECT AVG(score) FROM properties WHERE score IS NOT NULL")
    avg_cap   = await conn.fetchval("SELECT AVG(cap_rate) FROM properties WHERE cap_rate IS NOT NULL")
    print(f"\n  Avg score : {avg_score:.1f}")
    print(f"  Avg cap   : {avg_cap:.2f}%")
    print("─" * 70)

    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
