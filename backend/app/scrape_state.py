"""
Global scrape progress state — updated live by scheduler.scrape_job().
Read by GET /api/admin/scrape-status for frontend polling.
"""
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class SourceProgress:
    target:  int = 0
    done:    int = 0
    status:  str = "pending"   # "pending" | "running" | "done" | "error"
    message: str = ""


@dataclass
class ScrapeProgress:
    running:        bool = False
    current_source: str  = ""
    total_new:      int  = 0
    total_updated:  int  = 0
    total_errors:   int  = 0
    elapsed_seconds: float = 0.0
    message:        str  = ""
    started_at:     Optional[str] = None
    finished_at:    Optional[str] = None

    sources: dict = field(default_factory=lambda: {
        "realtor": SourceProgress(target=50),
        "centris": SourceProgress(target=50),
        "remax":   SourceProgress(target=50),
    })

    def reset(self):
        self.running        = True
        self.current_source = ""
        self.total_new      = 0
        self.total_updated  = 0
        self.total_errors   = 0
        self.elapsed_seconds = 0.0
        self.message        = "Starting..."
        self.finished_at    = None
        for src in self.sources.values():
            src.done    = 0
            src.status  = "pending"
            src.message = ""

    def to_dict(self) -> dict:
        return {
            "running":         self.running,
            "current_source":  self.current_source,
            "total_new":       self.total_new,
            "total_updated":   self.total_updated,
            "total_errors":    self.total_errors,
            "elapsed_seconds": round(self.elapsed_seconds, 1),
            "message":         self.message,
            "started_at":      self.started_at,
            "finished_at":     self.finished_at,
            "sources": {
                name: {
                    "target":  sp.target,
                    "done":    sp.done,
                    "status":  sp.status,
                    "message": sp.message,
                    "pct":     round(sp.done / sp.target * 100) if sp.target else 0,
                }
                for name, sp in self.sources.items()
            },
        }


# Single shared instance — imported by scheduler and admin routes
scrape_progress = ScrapeProgress()

# Separate instance for the 4+ unit scheduler.scrape_multiunit_job() — kept apart
# from scrape_progress so the two jobs' live status never overwrite each other.
# No "remax" source: that job only covers Realtor.ca + Centris (see scheduler.py).
multiunit_scrape_progress = ScrapeProgress(sources={
    "realtor": SourceProgress(target=100),
    "centris": SourceProgress(target=100),
})
