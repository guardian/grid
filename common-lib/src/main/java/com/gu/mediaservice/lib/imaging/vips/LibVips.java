package com.gu.mediaservice.lib.imaging.vips;

import com.sun.jna.Library;
import com.sun.jna.Native;

public interface LibVips extends Library {
  LibVips INSTANCE = Native.load("vips", LibVips.class);

  int vips_init(String argv0);
  String vips_error_buffer_copy();

  /*
   * ADDING A NEW BINDING? READ ME!
   * ------------------------------
   *
   * Look up your vips binding on the API index here: https://www.libvips.org/API/current/api-index-full.html
   *
   * Is the function you want to use varargs? (ie. does the signature end with `...);`)
   * If so, you _must_ declare this as varargs in this interface too!
   * (End the declaration with `Object... args);`)
   * Even if you don't want to use any of those optional arguments!
   * Even if you don't want future users to use any of those optional arguments!
   *
   * If you don't declare the function as varargs in Java, it will not be bound correctly to C,
   * and you will get _very, very_ weird error messages!
   *
   * If you were calling these varargs functions from C, you would need to pass a NULL pointer
   * as the final argument, even if you weren't using any optional arguments. JNA is very helpful
   * and does this for you. (Thank you JNA!)
   *
   * Translating types:
   *      C       |      Java
   * -------------|-----------------
   * VipsImage *  | VipsImage
   * VipsImage ** | VipsImageByReference
   * const char * | String
   * gchararray   | String
   * int          | int (or Integer)
   * gint         | int (or Integer)
   * double       | double (or Double)
   * gdouble      | double (or Double)
   * gboolean     | boolean
   * <enums>      | int (remember to check VIPS source for the correct enum values!)
   *
   * This table is inexhaustive, you may need to consult
   * https://github.com/java-native-access/jna/blob/master/www/Mappings.md
   * for more help
   *
   * Callers of these methods must pass java objects into the varargs.
   * eg. If you want to pass in an int, you must pass either a primitive int, or a java.lang.Integer
   * A scala.Int will compile, and look like it will be converted into a java int as works in almost
   * any other context. But because varargs here are declared as Object..., the conversion will not
   * happen, and odd errors will ensue.
   * Instead, pass as eg. `1.asInstanceOf[java.lang.Integer]` (or, make a wrapping function in Java,
   * passing the int in as a primitive `int`).
   */

  VipsImage vips_image_new_from_file(String filename, Object... args);

  int vips_thumbnail(String filename, VipsImageByReference out, int width, Object... args);

  int vips_icc_transform(VipsImage in, VipsImageByReference out, String output_profile_path, Object... args);
  int vips_colourspace(VipsImage in, VipsImageByReference out, int space, Object... args);

  int vips_image_guess_interpretation(VipsImage in);

  int vips_resize(VipsImage in, VipsImageByReference out, double scale, Object... args);
  int vips_extract_area(VipsImage in, VipsImageByReference out, int left, int top, int width, int height, Object... args);

  int vips_jpegsave(VipsImage in, String filename, Object... args);
  int vips_pngsave(VipsImage in, String filename, Object... args);
  int vips_image_write_to_file(VipsImage image, String name, Object... args);
}
