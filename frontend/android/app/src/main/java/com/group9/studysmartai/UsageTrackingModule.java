package com.group9.studysmartai;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.os.Process;
import android.provider.Settings;
import androidx.annotation.NonNull;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import java.util.Calendar;
import java.util.Map;

public class UsageTrackingModule extends ReactContextBaseJavaModule {

  private final ReactApplicationContext context;

  UsageTrackingModule(ReactApplicationContext context) {
    super(context);
    this.context = context;
  }

  @NonNull
  @Override
  public String getName() {
    return "UsageTracking";
  }

  private boolean isGranted() {
    AppOpsManager ops = (AppOpsManager) context.getSystemService(Context.APP_OPS_SERVICE);
    return (
      ops != null &&
      ops.checkOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        Process.myUid(),
        context.getPackageName()
      ) == AppOpsManager.MODE_ALLOWED
    );
  }

  @ReactMethod
  public void hasPermission(Promise promise) {
    promise.resolve(isGranted());
  }

  @ReactMethod
  public void openPermissionSettings(Promise promise) {
    try {
      Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      context.startActivity(intent);
      promise.resolve(null);
    } catch (Exception e) {
      promise.reject("SETTINGS_UNAVAILABLE", e);
    }
  }

  @ReactMethod
  public void getTodayUsage(Promise promise) {
    if (!isGranted()) {
      promise.reject("USAGE_ACCESS_REQUIRED", "Enable Usage Access in Android Settings");
      return;
    }
    try {
      Calendar day = Calendar.getInstance();
      day.set(Calendar.HOUR_OF_DAY, 0);
      day.set(Calendar.MINUTE, 0);
      day.set(Calendar.SECOND, 0);
      day.set(Calendar.MILLISECOND, 0);
      long start = day.getTimeInMillis(),
        end = System.currentTimeMillis();
      UsageStatsManager manager = (UsageStatsManager) context.getSystemService(
        Context.USAGE_STATS_SERVICE
      );
      if (manager == null) {
        promise.reject("USAGE_UNAVAILABLE", "Usage statistics are unavailable on this device");
        return;
      }
      UsageEvents events = manager.queryEvents(start - 86400000L, end);
      if (events == null) {
        promise.reject("USAGE_UNAVAILABLE", "Unlock the device and try again");
        return;
      }
      UsageAccumulator accumulator = new UsageAccumulator(start, end);
      UsageEvents.Event event = new UsageEvents.Event();
      while (events.hasNextEvent()) {
        events.getNextEvent(event);
        int type = event.getEventType();
        long at = event.getTimeStamp();
        if (
          type == UsageEvents.Event.ACTIVITY_RESUMED || type == UsageEvents.Event.MOVE_TO_FOREGROUND
        ) {
          accumulator.resume(event.getPackageName(), at);
        } else if (
          type == UsageEvents.Event.ACTIVITY_PAUSED || type == UsageEvents.Event.MOVE_TO_BACKGROUND
        ) {
          accumulator.pause(event.getPackageName(), at);
        } else if (
          type == UsageEvents.Event.SCREEN_NON_INTERACTIVE ||
          type == UsageEvents.Event.KEYGUARD_SHOWN ||
          type == UsageEvents.Event.DEVICE_SHUTDOWN
        ) {
          accumulator.close(at);
        }
      }
      Map<String, Long> totals = accumulator.finish();
      WritableArray result = Arguments.createArray();
      for (Map.Entry<String, Long> entry : totals.entrySet()) {
        if (entry.getKey().equals(context.getPackageName()) || entry.getValue() < 1000) continue;
        WritableMap item = Arguments.createMap();
        item.putString("packageName", entry.getKey());
        String label = entry.getKey();
        try {
          label = context
            .getPackageManager()
            .getApplicationLabel(context.getPackageManager().getApplicationInfo(entry.getKey(), 0))
            .toString();
        } catch (android.content.pm.PackageManager.NameNotFoundException ignored) {
        }
        item.putString("appName", label);
        item.putDouble("minutes", entry.getValue() / 60000.0);
        result.pushMap(item);
      }
      promise.resolve(result);
    } catch (Exception e) {
      promise.reject("USAGE_QUERY_FAILED", e);
    }
  }
}
