# Class map: PlantVillage <-> PlantDoc <-> PlantWild

| PlantVillage | PlantDoc | PlantWild | Status | PD test | PW test | Note |
| --- | --- | --- | --- | ---: | ---: | --- |
| Apple___Apple_scab | Apple Scab Leaf | apple scab | exact | 10 | 58 |  |
| Apple___Black_rot | — | apple black rot | exact | 0 | 34 | PlantDoc has no apple black rot |
| Apple___Cedar_apple_rust | Apple rust leaf | apple rust | probable | 10 | 61 | field labels say 'rust'; cedar-apple is the common one, others possible |
| Apple___healthy | Apple leaf | apple leaf | exact | 9 | 88 |  |
| Blueberry___healthy | Blueberry leaf | blueberry leaf | exact | 11 | 56 |  |
| Cherry_(including_sour)___Powdery_mildew | — | cherry powdery mildew | exact | 0 | 22 |  |
| Cherry_(including_sour)___healthy | Cherry leaf | cherry leaf | exact | 10 | 57 |  |
| Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot | Corn Gray leaf spot | corn gray leaf spot | exact | 4 | 43 |  |
| Corn_(maize)___Common_rust_ | Corn rust leaf | corn rust | probable | 10 | 47 | field 'rust' may include southern rust (P. polysora) |
| Corn_(maize)___Northern_Leaf_Blight | Corn leaf blight | corn northern leaf blight | exact | 12 | 44 | PlantDoc says only 'leaf blight'; its images are northern leaf blight |
| Corn_(maize)___healthy | — | corn leaf | exact | 0 | 31 | PlantDoc has no healthy corn |
| Grape___Black_rot | grape leaf black rot | grape black rot | exact | 8 | 45 |  |
| Grape___Esca_(Black_Measles) | — | — | none | 0 | 0 |  |
| Grape___Leaf_blight_(Isariopsis_Leaf_Spot) | — | — | none | 0 | 0 | PlantWild 'grape leaf spot' is unspecific; left unmapped |
| Grape___healthy | grape leaf | grape leaf | exact | 12 | 40 |  |
| Orange___Haunglongbing_(Citrus_greening) | — | citrus greening disease | exact | 0 | 47 | PlantWild is all citrus, not only orange |
| Peach___Bacterial_spot | — | — | none | 0 | 0 |  |
| Peach___healthy | Peach leaf | peach leaf | exact | 9 | 31 |  |
| Pepper,_bell___Bacterial_spot | Bell_pepper leaf spot | bell pepper leaf spot | probable | 9 | 23 | field 'leaf spot' is not necessarily bacterial |
| Pepper,_bell___healthy | Bell_pepper leaf | bell pepper leaf | exact | 8 | 48 |  |
| Potato___Early_blight | Potato leaf early blight | potato early blight | exact | 8 | 45 |  |
| Potato___Late_blight | Potato leaf late blight | potato late blight | exact | 8 | 48 |  |
| Potato___healthy | — | potato leaf | exact | 0 | 49 | PlantDoc has no healthy potato |
| Raspberry___healthy | Raspberry leaf | raspberry leaf | exact | 7 | 36 |  |
| Soybean___healthy | Soyabean leaf | soybean leaf | exact | 8 | 48 |  |
| Squash___Powdery_mildew | Squash Powdery mildew leaf | squash powdery mildew | exact | 6 | 56 |  |
| Strawberry___Leaf_scorch | — | strawberry leaf scorch | exact | 0 | 15 |  |
| Strawberry___healthy | Strawberry leaf | strawberry leaf | exact | 8 | 39 |  |
| Tomato___Bacterial_spot | Tomato leaf bacterial spot | tomato bacterial leaf spot | exact | 9 | 56 |  |
| Tomato___Early_blight | Tomato Early blight leaf | tomato early blight | exact | 9 | 69 |  |
| Tomato___Late_blight | Tomato leaf late blight | tomato late blight | exact | 10 | 59 |  |
| Tomato___Leaf_Mold | Tomato mold leaf | tomato leaf mold | exact | 6 | 47 |  |
| Tomato___Septoria_leaf_spot | Tomato Septoria leaf spot | tomato septoria leaf spot | exact | 11 | 44 |  |
| Tomato___Spider_mites Two-spotted_spider_mite | Tomato two spotted spider mites leaf | — | exact | 0 | 0 | PlantDoc train only; 0 PlantDoc test images |
| Tomato___Target_Spot | — | — | none | 0 | 0 |  |
| Tomato___Tomato_Yellow_Leaf_Curl_Virus | Tomato leaf yellow virus | tomato yellow leaf curl virus | exact | 6 | 34 |  |
| Tomato___Tomato_mosaic_virus | Tomato leaf mosaic virus | tomato mosaic virus | probable | 10 | 37 | field 'mosaic virus' on tomato may include TMV/CMV, not only ToMV |
| Tomato___healthy | Tomato leaf | tomato leaf | exact | 8 | 45 |  |

## Coverage

- PlantVillage classes with a PlantDoc counterpart: 28/38; PlantDoc test images covered: 236/236
- PlantVillage classes with a PlantWild counterpart: 33/38; PlantWild test images covered: 1502/3677
- PlantDoc classes with no PlantVillage counterpart: none
- PlantWild classes with no PlantVillage counterpart (56): apple mosaic virus, banana leaf, banana panama disease, basil downy mildew, basil leaf, bean halo blight, bean leaf, bean mosaic virus, bean rust, blueberry rust, broccoli downy mildew, broccoli leaf, cabbage alternaria leaf spot, cabbage leaf, carrot cavity spot, cauliflower alternaria leaf spot, cauliflower leaf, celery anthracnose, celery early blight, celery leaf, cherry leaf spot, citrus canker, coffee leaf, coffee leaf rust, corn smut, cucumber angular leaf spot, cucumber bacterial wilt, cucumber leaf, cucumber powdery mildew, eggplant cercospora leaf spot, eggplant leaf, garlic leaf, garlic leaf blight, garlic rust, ginger leaf, ginger leaf spot, ginger sheath blight, grape downy mildew, grape leaf spot, grapevine leafroll disease, lettuce downy mildew, lettuce leaf, lettuce mosaic virus, maple leaf, maple tar spot, peach leaf curl, plum leaf, plum pocket disease, rice blast, rice leaf, rice sheath blight, squash leaf, strawberry anthracnose, tobacco leaf, tobacco mosaic virus, zucchini yellow mosaic virus
