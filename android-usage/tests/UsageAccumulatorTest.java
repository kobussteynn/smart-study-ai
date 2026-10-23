package com.group9.studysmartai;

public class UsageAccumulatorTest {

  public static void main(String[] args) {
    UsageAccumulator midnight = new UsageAccumulator(100, 300);
    midnight.resume("reader", 50);
    midnight.pause("reader", 180);
    assert midnight.finish().get("reader") == 80L : "Clip sessions at midnight";

    UsageAccumulator switchApp = new UsageAccumulator(0, 300);
    switchApp.resume("reader", 10);
    switchApp.resume("video", 100);
    switchApp.pause("reader", 110);
    switchApp.close(200);
    assert switchApp.finish().get("reader") == 90L;
    assert switchApp.finish().get("video") == 100L;

    UsageAccumulator ongoing = new UsageAccumulator(0, 300);
    ongoing.resume("reader", 50);
    ongoing.resume("reader", 100);
    assert ongoing.finish().get("reader") == 250L : "No double counting duplicate resumes";

    UsageAccumulator previous = new UsageAccumulator(100, 300);
    previous.resume("reader", 10);
    previous.close(90);
    assert previous.finish().isEmpty() : "Exclude activity before today";
    System.out.println("UsageAccumulator: all checks passed");
  }
}
