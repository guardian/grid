package com.gu.mediaservice.lib.imaging.vips;

public enum VipsForeignKeep {
  VIPS_FOREIGN_KEEP_NONE(0),
  VIPS_FOREIGN_KEEP_EXIF(1),
  VIPS_FOREIGN_KEEP_XMP(2),
  VIPS_FOREIGN_KEEP_IPTC(4),
  VIPS_FOREIGN_KEEP_ICC(8),
  VIPS_FOREIGN_KEEP_OTHER(16);

  public final int value;

  VipsForeignKeep(int value) {
    this.value = value;
  }
}
