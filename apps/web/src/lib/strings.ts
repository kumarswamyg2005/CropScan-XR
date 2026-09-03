/**
 * EN/TE strings. Every user-facing string in both languages.
 *
 * Telugu is a real feature for this audience, not a demo toggle, so a missing
 * translation is a type error rather than a silent fallback to English.
 */

export const STRINGS = {
  appName: { en: 'CropScan XR', te: 'క్రాప్‌స్కాన్ XR' },

  navScan: { en: 'Scan', te: 'స్కాన్' },
  navDiseases: { en: 'Diseases', te: 'వ్యాధులు' },
  navField: { en: 'Field', te: 'క్షేత్రం' },
  navLedger: { en: 'Ledger', te: 'రికార్డు' },
  navAbout: { en: 'Method', te: 'పద్ధతి' },
  skipToContent: { en: 'Skip to content', te: 'విషయానికి వెళ్లండి' },

  heroCaption: {
    en: 'A leaf photo becomes a verifiable field record, and the disease it shows can be stepped through in VR — infection to sporulation — with the weather that caused it exposed as controls.',
    te: 'ఒక ఆకు ఫోటో ధృవీకరించదగిన క్షేత్ర రికార్డుగా మారుతుంది, మరియు అది చూపే వ్యాధిని VRలో దశలవారీగా చూడవచ్చు — సంక్రమణ నుండి బీజాంశ ఉత్పత్తి వరకు — దానికి కారణమైన వాతావరణం నియంత్రణలుగా ఉంటుంది.',
  },
  startScan: { en: 'Scan a leaf', te: 'ఆకును స్కాన్ చేయండి' },
  browseDiseases: { en: 'Browse diseases', te: 'వ్యాధులను చూడండి' },

  mountSpecimen: { en: 'Mounting a specimen', te: 'నమూనాను ఉంచడం' },
  guidanceFillFrame: { en: 'Fill the frame with one leaf', te: 'ఫ్రేమ్‌ను ఒకే ఆకుతో నింపండి' },
  guidanceLight: { en: 'Use diffuse daylight, avoid harsh shadow', te: 'మృదువైన పగటి వెలుతురు వాడండి, గట్టి నీడలు వద్దు' },
  guidanceBacking: { en: 'Plain backing behind the leaf', te: 'ఆకు వెనుక సాదా నేపథ్యం ఉంచండి' },
  guidanceFocus: { en: 'Hold still until it is sharp', te: 'స్పష్టంగా వచ్చే వరకు కదలకండి' },
  guidanceWhy: {
    en: 'These four things are what decide whether the model can answer at all.',
    te: 'మోడల్ సమాధానం ఇవ్వగలదా లేదా అనేది ఈ నాలుగు విషయాలే నిర్ణయిస్తాయి.',
  },
  capture: { en: 'Capture', te: 'ఫోటో తీయండి' },
  choosePhoto: { en: 'Choose a photo', te: 'ఫోటో ఎంచుకోండి' },
  analysing: { en: 'Reading the specimen', te: 'నమూనాను పరిశీలిస్తోంది' },

  determination: { en: 'Determination', te: 'నిర్ధారణ' },
  confidence: { en: 'confidence', te: 'నమ్మకం' },
  model: { en: 'model', te: 'మోడల్' },
  recorded: { en: 'recorded', te: 'నమోదు' },
  specimenHash: { en: 'image', te: 'చిత్రం' },
  photo: { en: 'Photo', te: 'ఫోటో' },
  attention: { en: 'Model attention', te: 'మోడల్ దృష్టి' },
  severity: { en: 'Severity', te: 'తీవ్రత' },
  healthyToNecrotic: { en: 'healthy → necrotic', te: 'ఆరోగ్యం → మృత కణజాలం' },
  alsoConsidered: { en: 'Also considered', te: 'ఇతర అవకాశాలు' },

  uncertainTitle: { en: 'Not confident enough to name a disease', te: 'వ్యాధిని నిర్ధారించేంత నమ్మకం లేదు' },
  uncertainBody: {
    en: 'This is a correct outcome, not an error. The model abstains rather than guess, because a confident wrong answer is what costs a farmer a spray. Retake the photo using the guidance and try again.',
    te: 'ఇది లోపం కాదు, సరైన ఫలితమే. ఊహించడం కంటే మోడల్ మౌనంగా ఉంటుంది — ఎందుకంటే తప్పుడు నమ్మకమైన సమాధానమే రైతుకు నష్టం. సూచనలను పాటించి మళ్లీ ఫోటో తీయండి.',
  },
  retake: { en: 'Retake the photo', te: 'మళ్లీ ఫోటో తీయండి' },

  symptoms: { en: 'Symptoms', te: 'లక్షణాలు' },
  organic: { en: 'Organic', te: 'సేంద్రియ' },
  chemical: { en: 'Chemical', te: 'రసాయన' },
  prevention: { en: 'Prevention', te: 'నివారణ' },

  howItGotSick: { en: 'How this plant got sick', te: 'ఈ మొక్కకు వ్యాధి ఎలా వచ్చింది' },
  pathogen: { en: 'Pathogen', te: 'వ్యాధికారకం' },
  cycleType: { en: 'Cycle', te: 'చక్రం' },
  overwinters: { en: 'Survives on', te: 'ఎక్కడ మనుగడ' },
  spreadBy: { en: 'Spread by', te: 'వ్యాప్తి' },
  interventions: { en: 'Where to break it', te: 'ఎక్కడ ఆపాలి' },
  sources: { en: 'Sources', te: 'ఆధారాలు' },
  needs: { en: 'needs', te: 'అవసరం' },
  noCycleYet: {
    en: 'No disease cycle has been written up for this diagnosis yet.',
    te: 'ఈ నిర్ధారణకు వ్యాధి చక్రం ఇంకా రాయబడలేదు.',
  },

  enterField: { en: 'Enter the field', te: 'క్షేత్రంలోకి వెళ్లండి' },
  enterInVR: { en: 'Enter in VR', te: 'VRలో ప్రవేశించండి' },
  viewOnScreen: { en: 'View on this screen', te: 'ఈ స్క్రీన్‌పై చూడండి' },
  fieldModule: { en: 'Field module', te: 'క్షేత్ర మాడ్యూల్' },
  fieldIntro: {
    en: 'Walk the row. Run the infection cycle on the plant you photographed. Break it by changing one condition.',
    te: 'వరుసలో నడవండి. మీరు ఫోటో తీసిన మొక్కపై సంక్రమణ చక్రాన్ని నడపండి. ఒక పరిస్థితిని మార్చి దాన్ని ఆపండి.',
  },
  headsetSupported: { en: 'WebXR available', te: 'WebXR అందుబాటులో ఉంది' },
  headsetMissing: { en: 'No headset detected', te: 'హెడ్‌సెట్ కనిపించలేదు' },
  desktopFallback: {
    en: 'No headset here. The scene still runs on this screen with orbit controls.',
    te: 'ఇక్కడ హెడ్‌సెట్ లేదు. ఈ స్క్రీన్‌పై ఆర్బిట్ నియంత్రణలతో దృశ్యం నడుస్తుంది.',
  },

  temperature: { en: 'Temperature', te: 'ఉష్ణోగ్రత' },
  leafWetness: { en: 'Leaf wetness', te: 'ఆకు తడి' },
  humidity: { en: 'Humidity', te: 'తేమ' },
  play: { en: 'Run the cycle', te: 'చక్రాన్ని నడపండి' },
  reset: { en: 'Reset', te: 'రీసెట్' },
  cycleHalted: { en: 'The cycle stopped here', te: 'చక్రం ఇక్కడ ఆగిపోయింది' },
  diseaseTriangle: { en: 'Disease triangle', te: 'వ్యాధి త్రిభుజం' },
  host: { en: 'Host', te: 'ఆతిథేయ మొక్క' },
  environment: { en: 'Environment', te: 'వాతావరణం' },

  ledgerTitle: { en: 'The record', te: 'రికార్డు' },
  ledgerIntro: {
    en: 'Every scan and every payment is appended to a hash chain. Each entry carries the hash of the one before it, so changing any past record breaks every record after it.',
    te: 'ప్రతి స్కాన్ మరియు ప్రతి చెల్లింపు హాష్ చెయిన్‌కు జోడించబడుతుంది. ప్రతి ఎంట్రీ దానికి ముందు ఉన్నదాని హాష్‌ను కలిగి ఉంటుంది, కాబట్టి గత రికార్డును మార్చితే తర్వాతి అన్నీ విరిగిపోతాయి.',
  },
  verifyChain: { en: 'Verify the chain', te: 'చెయిన్‌ను తనిఖీ చేయండి' },
  chainIntact: { en: 'Chain intact', te: 'చెయిన్ సురక్షితం' },
  chainBroken: { en: 'Chain broken', te: 'చెయిన్ విరిగింది' },
  entriesChecked: { en: 'entries checked', te: 'ఎంట్రీలు తనిఖీ చేయబడ్డాయి' },

  aboutTitle: { en: 'How this was built, and what it cannot do', te: 'ఇది ఎలా నిర్మించబడింది, మరియు ఏమి చేయలేదు' },
  fieldAccuracy: { en: 'Field accuracy', te: 'క్షేత్ర ఖచ్చితత్వం' },
  labAccuracy: { en: 'Lab accuracy', te: 'ప్రయోగశాల ఖచ్చితత్వం' },
  domainGap: { en: 'The gap', te: 'తేడా' },

  loading: { en: 'Loading', te: 'లోడ్ అవుతోంది' },
  errorTitle: { en: 'Something went wrong', te: 'ఏదో తప్పు జరిగింది' },
  tryAgain: { en: 'Try again', te: 'మళ్లీ ప్రయత్నించండి' },
  notFound: { en: 'Not found', te: 'కనుగొనబడలేదు' },
  backHome: { en: 'Back to the start', te: 'మొదటికి తిరిగి' },
  allCrops: { en: 'All crops', te: 'అన్ని పంటలు' },
} as const

export type StringKey = keyof typeof STRINGS
