# Data audit

| Dataset | Images | Splits | Classes | Smallest / largest class | Corrupt | Exact dup copies | Same-dHash copies | Width p5/med/p95 | Height p5/med/p95 |
| --- | ---: | --- | ---: | --- | ---: | ---: | ---: | --- | --- |
| plantdoc | 2,578 | test 236, train 2342 | 28 | 2 / 192 | 0 | 12 | 54 | 300/800/3071 | 240/667/2592 |
| plantvillage | 54,381 | train 43503, test 10878 | 38 | 152 / 5507 | 0 | 287 | 297 | 256/256/256 | 256/256/256 |
| plantwild | 18,542 | train 13045, test 3677, val 1820 | 89 | 44 / 589 | 0 | 367 | 523 | 229/645/1732 | 202/514/1600 |

## Cross-dataset duplicates (dHash Hamming <= 3, confirmed by 32x32 correlation >= 0.9)

| Pair | Hash candidates | Confirmed pairs | Images involved (each side) | Of which in a TEST split (each side) |
| --- | ---: | ---: | --- | --- |
| plantdoc vs plantvillage | 50 | 0 | 0 / 0 | 0 / 0 |
| plantdoc vs plantwild | 448 | 399 | 342 / 363 | 31 / 57 |
| plantvillage vs plantwild | 288 | 34 | 34 / 33 | 14 / 6 |

Per-class counts are in `audit.json`.
