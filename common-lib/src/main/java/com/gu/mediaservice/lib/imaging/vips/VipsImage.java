package com.gu.mediaservice.lib.imaging.vips;

import com.sun.jna.Pointer;
import com.sun.jna.PointerType;

/**
 * Represents a VipsImage* (a _pointer_ to a VipsImage)
 */
public class VipsImage extends PointerType {
  @SuppressWarnings("unused")
  public VipsImage() {
    super();
  }

  /**
   * Construct a VipsImage around an existing pointer object.
   * Careful! You can easily construct with any arbitrary pointer. If the pointer does not point
   * to an actual VipsImage object (on the native side) then unexpected errors will occur!
   * @param p
   */
  public VipsImage(Pointer p) {
    super(p);
  }
}
