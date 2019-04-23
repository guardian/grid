package com.gu.mediaservice;

import com.google.common.hash.HashFunction;
import com.google.common.hash.Hashing;

// Guava has deprecated SHA-1 because it is insecure cryptographically
// We still want to use it in the Grid to make backwards-compatible image IDs.
// Unfortunately Scala does not let suppress deprecation warnings and we have -Xfatal-warnings...
// so a fun hacky solution is to write wrapper code in Java!
@SuppressWarnings("deprecated")
public class DeprecatedHashWrapper {
  public static HashFunction sha1() {
    return Hashing.sha1();
  }
}
