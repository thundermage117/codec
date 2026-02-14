#ifndef TRANSFORM_H
#define TRANSFORM_H

void dct8x8(const double src[8][8], double dst[8][8]);
void idct8x8(const double src[8][8], double dst[8][8]);

#endif // TRANSFORM_H
