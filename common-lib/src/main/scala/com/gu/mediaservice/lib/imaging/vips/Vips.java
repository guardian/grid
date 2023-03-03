//package com.gu.mediaservice.lib.imaging.vips;
//
//import com.gu.mediaservice.model.Bounds;
//import com.sun.jna.ptr.PointerByReference;
//
//import java.io.File;
//
//
//public class Vips {
////  def extractArea(sourceFile: File, outputFile: File, bounds: Bounds, qual: Double): Unit = {
////
////  }
//
//  void cropit() {
//    VipsImage image = LibVips.INSTANCE.vips_image_new_from_file("test.jpg");
//    if (image == null) {
//      throw new Error("couldn't load file!! because" + LibVips.INSTANCE.vips_error_buffer_copy());
//    }
//
////    VipsImageByReference cropOutput = new VipsImageByReference();
//    PointerByReference x = new PointerByReference();
//    if (LibVips.INSTANCE.vips_extract_area(
//      image, x, 0, 0,
//      750, 750
//    ) != 0) {
//      throw new Error("couldn't crop file!! because " + LibVips.INSTANCE.vips_error_buffer_copy());
//    }
//
//    if (LibVips.INSTANCE.vips_image_write_to_file(new VipsImage(x.getValue()), "donezo.png") != 0) {
//      throw new Error("couldn't save file!! because " + LibVips.INSTANCE.vips_error_buffer_copy());
//    }
//  }
//
//  public static void main(String[] args) {
//    System.out.println("asdfasdlfkjsad");
//    new Vips().cropit();
//  }
//}
//
