/*
*
* Functional Domain: Display
* Byte: 0x0A
*
* Attribute                                 |   Byte    |   COS |   R/W |   Implimented
* ------------------------------------------|-----------|-------|-------|---------------
* LCD Backlight Settings                    |   0x01    |   *   |   R/W |
*
* Wiki §10.1: constant/screensaver + active level (0–10).
* Codec not implemented — tracked as P3.4 / #31.
* COS is model-dependent (attribute table vs §10.1 disagree; see Guide Errata).
*
*/
