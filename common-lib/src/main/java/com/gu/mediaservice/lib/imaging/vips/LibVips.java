package com.gu.mediaservice.lib.imaging.vips;

import com.sun.jna.Library;
import com.sun.jna.Native;

public interface LibVips extends Library {
  LibVips INSTANCE = Native.load("vips", LibVips.class);

  int vips_init(String argv0);
  String vips_error_buffer_copy();

  VipsImage vips_image_new_from_file(String filename, Object... args);

  int vips_thumbnail(String filename, VipsImageByReference out, int width, Object... args);

  int vips_icc_transform(VipsImage in, VipsImageByReference out, String output_profile_path, Object... args);
  int vips_colourspace(VipsImage in, VipsImageByReference out, int space);

  int vips_image_guess_interpretation(VipsImage in);

  int vips_resize(VipsImage in, VipsImageByReference out, double scale, Object... args);
  int vips_extract_area(VipsImage in, VipsImageByReference out, int left, int top, int width, int height, Object... args);

  int vips_jpegsave(VipsImage in, String filename, Object... args);
  int vips_pngsave(VipsImage in, String filename, Object... args);
  int vips_image_write_to_file(VipsImage image, String name, Object... args);
}
