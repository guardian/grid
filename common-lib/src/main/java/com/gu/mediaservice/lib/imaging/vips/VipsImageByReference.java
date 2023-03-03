package com.gu.mediaservice.lib.imaging.vips;

import com.sun.jna.Native;
import com.sun.jna.Pointer;
import com.sun.jna.ptr.ByReference;

/**
 * Represents a VipsImage** (double pointer)
 */
public class VipsImageByReference extends ByReference {
  @SuppressWarnings("unused")
  public VipsImageByReference() {
    this(null);
  }

  public VipsImageByReference(Pointer value) {
    super(Native.POINTER_SIZE);
    setValue(value);
  }

  public void setValue(Pointer value) {
    getPointer().setPointer(0, value);
  }
  public void setValue(VipsImage image) {
    if (image == null) {
      setValue((Pointer)null);
      return;
    }
    getPointer().setPointer(0, image.getPointer());
  }

  public VipsImage getValue() {
    return new VipsImage(getPointer().getPointer(0));
  }
}
