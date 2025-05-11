package com.gu.mediaservice.lib.imaging.vips;

public enum VipsInterpretation {
  VIPS_INTERPRETATION_ERROR(-1),
  VIPS_INTERPRETATION_MULTIBAND(0),
  VIPS_INTERPRETATION_B_W(1),
  VIPS_INTERPRETATION_HISTOGRAM(10),
  VIPS_INTERPRETATION_XYZ(12),
  VIPS_INTERPRETATION_LAB(13),
  VIPS_INTERPRETATION_CMYK(15),
  VIPS_INTERPRETATION_LABQ(16),
  VIPS_INTERPRETATION_RGB(17),
  VIPS_INTERPRETATION_CMC(18),
  VIPS_INTERPRETATION_LCH(19),
  VIPS_INTERPRETATION_LABS(21),
  VIPS_INTERPRETATION_sRGB(22),
  VIPS_INTERPRETATION_YXY(23),
  VIPS_INTERPRETATION_FOURIER(24),
  VIPS_INTERPRETATION_RGB16(25),
  VIPS_INTERPRETATION_GREY16(26),
  VIPS_INTERPRETATION_MATRIX(27),
  VIPS_INTERPRETATION_scRGB(28),
  VIPS_INTERPRETATION_HSV(29),
  VIPS_INTERPRETATION_LAST(30);
  public final int value;
  private VipsInterpretation(int value) {
    this.value = value;
  }

  public static VipsInterpretation fromValue(int value) {
    VipsInterpretation[] values = VipsInterpretation.values();
    for (VipsInterpretation vipsInterpretation : values) {
      if (vipsInterpretation.value == value) return vipsInterpretation;
    }
    return VIPS_INTERPRETATION_ERROR;
  }
}
