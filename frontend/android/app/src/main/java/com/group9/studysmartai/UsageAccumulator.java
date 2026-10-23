package com.group9.studysmartai;

import java.util.HashMap;
import java.util.Map;

final class UsageAccumulator {

  private final long start;
  private final long end;
  private final Map<String, Long> totals = new HashMap<>();
  private String foreground;
  private long since;

  UsageAccumulator(long start, long end) {
    this.start = start;
    this.end = end;
  }

  void resume(String packageName, long at) {
    close(at);
    foreground = packageName;
    since = at;
  }

  void pause(String packageName, long at) {
    if (packageName != null && packageName.equals(foreground)) close(at);
  }

  void close(long at) {
    long duration = Math.min(end, at) - Math.max(start, since);
    if (foreground != null && duration > 0) totals.merge(foreground, duration, Long::sum);
    foreground = null;
  }

  Map<String, Long> finish() {
    close(end);
    return totals;
  }
}
