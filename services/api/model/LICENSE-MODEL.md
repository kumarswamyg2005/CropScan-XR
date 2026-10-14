# Model licence and credit

`model.onnx` is the CropScan field model (v6): the BioCLIP ViT-B/16 image encoder fine-tuned for
69 classes (68 crop-leaf classes and `Not_a_leaf`), then int8-quantised for CPU serving.

## Licence of the weights: CC BY-SA 3.0

The weights were trained on PlantVillage, which is CC BY-SA 3.0 and states that algorithms trained
on the data fall under the same licence (Hughes and Salathe 2015, arXiv 1511.08060). The weights
are therefore shared under
[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Credit PlantVillage
(Mohanty, Hughes, Salathe 2016, doi 10.3389/fpls.2016.01419) and BioCLIP when you reuse them.

## Derived from BioCLIP (MIT)

Starting weights: BioCLIP, Stevens et al., "BioCLIP: A Vision Foundation Model for the Tree of
Life", CVPR 2024, https://github.com/Imageomics/bioclip. Its copyright notices, as in its
LICENSE file, are:

    Copyright (c) 2023-2024 Imageomics Institute
    Copyright (c) 2012-2021 Gabriel Ilharco, Mitchell Wortsman, Nicholas Carlini, Rohan Taori,
    Achal Dave, Vaishaal Shankar, John Miller, Hongseok Namkoong, Hannaneh Hajishirzi,
    Ali Farhadi, Ludwig Schmidt

BioCLIP is released under the MIT licence: permission is granted to use, copy, modify, merge,
publish, distribute, sublicense and sell copies, provided the copyright notice and the MIT
permission notice are included in all copies or substantial portions. The software is provided
"as is", without warranty of any kind. The full MIT text is in the BioCLIP repository.

## Training data

- PlantVillage (CC BY-SA 3.0), 11,010 training images.
- 26 field-photo sources, credited under CC BY 4.0 (or the licence stated for each); full details,
  with DOIs, in `docs/datasets.md`:
  - PlantDoc, Singh et al. 2020 (CC BY 4.0), doi 10.1145/3371158.3371196
  - Grape: GVLiD, Mendeley doi 10.17632/wkymf8bhcg.5; FieldVitis, Zenodo doi 10.5281/zenodo.17307846
  - Potato in uncontrolled environment, Shabrina et al. 2023, doi 10.17632/ptz377bwb8.1
  - Corn, Tanzania, doi 10.17632/fkw49mz3xs.1
  - Orange: doi 10.17632/f7cr74mwpj.2 and doi 10.17632/jgkh2jxbwt.3
  - Pumpkin leaf diseases, Bangladesh, doi 10.17632/wtxcw8wpxb.2
  - Tomato: doi 10.17632/93h9p62kg4.1; TCP (tomato, chilli, papaya), doi 10.17632/m4m6j2tjfj.4
  - Soybean, doi 10.17632/w8vm4mm8t4.1
  - Rice: doi 10.17632/t46kkgh2yw.1 and doi 10.17632/fwcj7stb8r.2 (Sethy et al. 2020)
  - Wheat: doi 10.17632/th422bg4yd.1, 10.17632/5gc7hwydwg.1 and 10.17632/wgd66f8n6h.1
  - Cotton: doi 10.17632/t9hgvk2h9p.1, 10.17632/b3jy2p6k8w.2 and 10.17632/74jsdxtmx2.3
  - Sugarcane: doi 10.17632/7fbnxcbnhp.2 and 10.17632/9424skmnrk.1
  - Chilli: doi 10.17632/wzc6r6w5w5.3 and 10.17632/tm3v4zmh7c.1
  - Mango: doi 10.17632/jpwtpv2c4s.1, 10.17632/278k27zd4t.1 and 10.17632/sd8hzpg69b.5
- 1,400 MS COCO 2017 photos with no plant (the `Not_a_leaf` class), selected for their open
  licences (CC BY 2.0, CC BY-SA 2.0, or no known copyright restrictions).

PlantWild (CC BY-NC-ND 4.0) was NOT used for training or for choosing the checkpoint.

## Limitations

- About 59-80% top-1 on field photos from outside the training farms (PlantDoc and PlantWild test
  sets, depending on whether the crop is given); lab-photo accuracy is much higher and is not what
  you will see outdoors.
- It can be confidently wrong on unfamiliar photos (other crops, odd lighting, textureless
  images). The confidence and entropy thresholds in `meta.json` reduce this but do not remove it.
- It is not a substitute for an agronomist or a plant-pathology lab.
