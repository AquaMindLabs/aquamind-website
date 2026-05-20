const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');

const root = path.join(__dirname, '..');

const files = [
  'app/index.js',
  'constants/translations.js',
  'data/algaeCatalog.js',
  'data/diseaseCatalog.js',
  'data/fishCatalogExpanded.js',
  'data/fishCatalogStarter.js',
  'data/plantCatalogExpanded.js',
  'data/plantCatalogStarter.js',
  'data/plantDiseaseCatalog.js',
  'features/aquarium/components/AiAssistantPanel.tsx',
  'features/aquarium/hooks/useReviewSectionInsights.ts',
  'features/aquarium/sections/FishSectionHelpers.ts',
  'features/aquarium/sections/ReviewSectionHelpers.ts',
  'features/aquarium/services/emergencyService.js',
  'features/aquarium/services/stockingCompatibilityService.js',
  'features/aquarium/services/tasksService.js',
  'features/aquarium/subscription/subscriptionModel.ts',
];

const replacements = [
  ['usuĹ„', 'usuń'],
  ['UsuĹ„', 'Usuń'],
  ['jakoĹ›Ä‡', 'jakość'],
  ['JakoĹ›Ä‡', 'Jakość'],
  ['Ĺ›', 'ś'],
  ['Ĺš', 'Ś'],
  ['Ĺ‚', 'ł'],
  ['ĹŁ', 'Ł'],
  ['ĹĽ', 'ż'],
  ['Ĺ»', 'Ż'],
  ['Ĺş', 'ź'],
  ['Ĺą', 'Ź'],
  ['Ä‡', 'ć'],
  ['ÄŚ', 'Ć'],
  ['Ä…', 'ą'],
  ['Ä„', 'Ą'],
  ['Ä™', 'ę'],
  ['ÄĘ', 'Ę'],
  ['Ăł', 'ó'],
  ['Ă“', 'Ó'],
  ['Â', ''],
  ['ś?', 'ść'],
  ['szczegółnie', 'szczególnie'],
  ['przywróeniu', 'przywróceniu'],

  [/\bBiale\b/g, 'Białe'],
  [/\bbiale\b/g, 'białe'],
  [/\bBialy\b/g, 'Biały'],
  [/\bbialy\b/g, 'biały'],
  [/\bZlotawy\b/g, 'Złotawy'],
  [/\bzlotawy\b/g, 'złotawy'],
  [/\bpyl\b/g, 'pył'],
  [/\bPyl\b/g, 'Pył'],
  [/\bpletw\b/g, 'płetw'],
  [/\bPletw\b/g, 'Płetw'],
  [/\bpletwy\b/g, 'płetwy'],
  [/\bPletwy\b/g, 'Płetwy'],
  [/\bpletwach\b/g, 'płetwach'],
  [/\bPostrzepione\b/g, 'Postrzępione'],
  [/\bpostrzepione\b/g, 'postrzępione'],
  [/\bsie\b/g, 'się'],
  [/\bSie\b/g, 'Się'],
  [/\blapie\b/g, 'łapie'],
  [/\bLapie\b/g, 'Łapie'],
  [/\bOspalosc\b/g, 'Ospałość'],
  [/\bospalosc\b/g, 'ospałość'],
  [/\bWzdecie\b/g, 'Wzdęcie'],
  [/\bwzdecie\b/g, 'wzdęcie'],
  [/\bChudniecie\b/g, 'Chudnięcie'],
  [/\bchudniecie\b/g, 'chudnięcie'],
  [/\bciagnace\b/g, 'ciągnące'],
  [/\bWyrazna\b/g, 'Wyraźna'],
  [/\bwyrazna\b/g, 'wyraźna'],
  [/\bkolorow\b/g, 'kolorów'],
  [/\bNagly\b/g, 'Nagły'],
  [/\bnagly\b/g, 'nagły'],

  [/\broslina\b/g, 'roślina'],
  [/\bRoslina\b/g, 'Roślina'],
  [/\brosline\b/g, 'roślinę'],
  [/\bRosline\b/g, 'Roślinę'],
  [/\brosliny\b/g, 'rośliny'],
  [/\bRosliny\b/g, 'Rośliny'],
  [/\broslin\b/g, 'roślin'],
  [/\bRoslin\b/g, 'Roślin'],
  [/\broslinnosc\b/g, 'roślinność'],
  [/\broslinna\b/g, 'roślinna'],
  [/\broslinnej\b/g, 'roślinnej'],
  [/\broslinny\b/g, 'roślinny'],
  [/\broslinnym\b/g, 'roślinnym'],
  [/\bliscie\b/g, 'liście'],
  [/\bLiscie\b/g, 'Liście'],
  [/\blisci\b/g, 'liści'],
  [/\bLisci\b/g, 'Liści'],
  [/\blisciach\b/g, 'liściach'],
  [/\bLisciach\b/g, 'Liściach'],
  [/\blodyg\b/g, 'łodyg'],
  [/\bLodyg\b/g, 'Łodyg'],
  [/\blodygowa\b/g, 'łodygowa'],
  [/\blodygowe\b/g, 'łodygowe'],
  [/\bZolkniecie\b/g, 'Żółknięcie'],
  [/\bzolkniecie\b/g, 'żółknięcie'],
  [/\bzolkniecia\b/g, 'żółknięcia'],
  [/\bZolkniecia\b/g, 'Żółknięcia'],
  [/\bmlodych\b/g, 'młodych'],
  [/\bMlodych\b/g, 'Młodych'],
  [/\bmlode\b/g, 'młode'],
  [/\bprzyrostow\b/g, 'przyrostów'],
  [/\bkrawedzi\b/g, 'krawędzi'],
  [/\bBrazowe\b/g, 'Brązowe'],
  [/\bbrazowe\b/g, 'brązowe'],
  [/\bBrazowy\b/g, 'Brązowy'],
  [/\bbrazowy\b/g, 'brązowy'],
  [/\bBrazowienie\b/g, 'Brązowienie'],
  [/\bbrazowienie\b/g, 'brązowienie'],
  [/\bkepki\b/g, 'kępki'],
  [/\bwloski\b/g, 'włoski'],
  [/\bwlosowate\b/g, 'włosowate'],
  [/\bWlosowate\b/g, 'Włosowate'],
  [/\bslabe\b/g, 'słabe'],
  [/\bSlabe\b/g, 'Słabe'],
  [/\bslaby\b/g, 'słaby'],
  [/\bSlaby\b/g, 'Słaby'],
  [/\bslaba\b/g, 'słaba'],
  [/\bSlaba\b/g, 'Słaba'],
  [/\bslabiej\b/g, 'słabiej'],
  [/\bslabsze\b/g, 'słabsze'],
  [/\bslabo\b/g, 'słabo'],
  [/\bSlabo\b/g, 'Słabo'],
  [/\bswiatlo\b/g, 'światło'],
  [/\bSwiatlo\b/g, 'Światło'],
  [/\bswiatla\b/g, 'światła'],
  [/\bSwiatla\b/g, 'Światła'],
  [/\bswietle\b/g, 'świetle'],
  [/\bSwietle\b/g, 'Świetle'],
  [/\bswiecenia\b/g, 'świecenia'],
  [/\bSwiecenia\b/g, 'Świecenia'],
  [/\boswietlenia\b/g, 'oświetlenia'],
  [/\bOswietlenia\b/g, 'Oświetlenia'],
  [/\boswietlenie\b/g, 'oświetlenie'],
  [/\bOswietlenie\b/g, 'Oświetlenie'],
  [/\bdlugi\b/g, 'długi'],
  [/\bDlugi\b/g, 'Długi'],
  [/\bdluzsze\b/g, 'dłuższe'],
  [/\bdluzszego\b/g, 'dłuższego'],
  [/\bdluzszymi\b/g, 'dłuższymi'],
  [/\bkrotki\b/g, 'krótki'],
  [/\bKrotki\b/g, 'Krótki'],
  [/\bkrotko\b/g, 'krótko'],
  [/\bkrotka\b/g, 'krótka'],

  [/\bpodloze\b/g, 'podłoże'],
  [/\bPodloze\b/g, 'Podłoże'],
  [/\bpodloza\b/g, 'podłoża'],
  [/\bPodloza\b/g, 'Podłoża'],
  [/\bpodlozu\b/g, 'podłożu'],
  [/\bPodlozu\b/g, 'Podłożu'],
  [/\bklacza\b/g, 'kłącza'],
  [/\bKlacza\b/g, 'Kłącza'],
  [/\bklacze\b/g, 'kłącze'],
  [/\bwode\b/g, 'wodę'],
  [/\bWode\b/g, 'Wodę'],
  [/\bweglanowa\b/g, 'węglanowa'],
  [/\bweglowy\b/g, 'węglowy'],
  [/\bzrodlo\b/g, 'źródło'],
  [/\bZrodlo\b/g, 'Źródło'],
  [/\bzrodla\b/g, 'źródła'],
  [/\bZrodla\b/g, 'Źródła'],
  [/\bjakosc\b/g, 'jakość'],
  [/\bJakosc\b/g, 'Jakość'],
  [/\bilosc\b/g, 'ilość'],
  [/\bIlosc\b/g, 'Ilość'],
  [/\bSprawdz\b/g, 'Sprawdź'],
  [/\bsprawdz\b/g, 'sprawdź'],
  [/\bRozwaz\b/g, 'Rozważ'],
  [/\brozwaz\b/g, 'rozważ'],
  [/\bzwieksz\b/g, 'zwiększ'],
  [/\bZwieksz\b/g, 'Zwiększ'],
  [/\bzwieksza\b/g, 'zwiększa'],
  [/\bZwieksza\b/g, 'Zwiększa'],
  [/\bzwiekszaj\b/g, 'zwiększaj'],
  [/\bzwiekszenie\b/g, 'zwiększenie'],
  [/\busun\b/g, 'usuń'],
  [/\bUsun\b/g, 'Usuń'],
  [/\busuniecia\b/g, 'usunięcia'],
  [/\bUsuniecia\b/g, 'Usunięcia'],
  [/\busuniecie\b/g, 'usunięcie'],
  [/\busuniete\b/g, 'usunięte'],
  [/\bUsuniete\b/g, 'Usunięte'],
  [/\busuniety\b/g, 'usunięty'],
  [/\busunieta\b/g, 'usunięta'],
  [/\bpotwierdz\b/g, 'potwierdź'],
  [/\bPotwierdz\b/g, 'Potwierdź'],

  [/\bmoze\b/g, 'może'],
  [/\bMoze\b/g, 'Może'],
  [/\bmoga\b/g, 'mogą'],
  [/\bMoga\b/g, 'Mogą'],
  [/\bbedzie\b/g, 'będzie'],
  [/\bBedzie\b/g, 'Będzie'],
  [/\bsa\b/g, 'są'],
  [/\bSa\b/g, 'Są'],
  [/\bktory\b/g, 'który'],
  [/\bKtory\b/g, 'Który'],
  [/\bktora\b/g, 'która'],
  [/\bktore\b/g, 'które'],
  [/\bktorych\b/g, 'których'],
  [/\bktorej\b/g, 'której'],
  [/\bktorym\b/g, 'którym'],
  [/\bparametrow\b/g, 'parametrów'],
  [/\bwarunkow\b/g, 'warunków'],
  [/\bskokow\b/g, 'skoków'],
  [/\bpreparatow\b/g, 'preparatów'],
  [/\bgatunkow\b/g, 'gatunków'],
  [/\bproblemow\b/g, 'problemów'],
  [/\bglonow\b/g, 'glonów'],
  [/\bczesto\b/g, 'często'],
  [/\bCzesto\b/g, 'Często'],
  [/\bnajczesciej\b/g, 'najczęściej'],
  [/\bNajczesciej\b/g, 'Najczęściej'],
  [/\bczesc\b/g, 'część'],
  [/\bCzesc\b/g, 'Część'],
  [/\bciezk/g, 'ciężk'],
  [/\bCiezk/g, 'Ciężk'],
  [/\bwzgledem\b/g, 'względem'],
  [/\bWzgledem\b/g, 'Względem'],
  [/\bLatwa\b/g, 'Łatwa'],
  [/\blatwa\b/g, 'łatwa'],
  [/\bLatwy\b/g, 'Łatwy'],
  [/\blatwy\b/g, 'łatwy'],
  [/\bLatwiejsza\b/g, 'Łatwiejsza'],
  [/\blatwiejsza\b/g, 'łatwiejsza'],
  [/\blagodne\b/g, 'łagodne'],
  [/\bLagodne\b/g, 'Łagodne'],
  [/\blagodny\b/g, 'łagodny'],
  [/\bzyworodka\b/g, 'żyworódka'],
  [/\bzyworodki\b/g, 'żyworódki'],
  [/\blawicowa\b/g, 'ławicowa'],
  [/\blawicowy\b/g, 'ławicowy'],
  [/\bwieksza\b/g, 'większa'],
  [/\bWieksza\b/g, 'Większa'],
  [/\bwieksze\b/g, 'większe'],
  [/\bwiekszej\b/g, 'większej'],
  [/\bwiekszy\b/g, 'większy'],
  [/\bwiekszym\b/g, 'większym'],
  [/\bduzo\b/g, 'dużo'],
  [/\bDuza\b/g, 'Duża'],
  [/\bduza\b/g, 'duża'],
  [/\bchlodniejsza\b/g, 'chłodniejszą'],
  [/\bmiekszej\b/g, 'miększej'],
  [/\bmiekka\b/g, 'miękka'],
  [/\bmiekkie\b/g, 'miękkie'],
  [/\bgesta\b/g, 'gęstą'],
  [/\bkryjowek\b/g, 'kryjówek'],
  [/\bprzeplyw\b/g, 'przepływ'],
  [/\bprzeplywu\b/g, 'przepływu'],
  [/\bprzeplywem\b/g, 'przepływem'],
  [/\bglowny\b/g, 'główny'],
  [/\bglowna\b/g, 'główna'],
  [/\bglowne\b/g, 'główne'],
  [/\bglownie\b/g, 'głównie'],
  [/\bmozliwe\b/g, 'możliwe'],
  [/\bMozliwe\b/g, 'Możliwe'],
  [/\bmozliwy\b/g, 'możliwy'],
  [/\bMozliwy\b/g, 'Możliwy'],
  [/\bmozliwa\b/g, 'możliwa'],
  [/\bmozesz\b/g, 'możesz'],
  [/\bMozesz\b/g, 'Możesz'],
  [/\bnawozenie\b/g, 'nawożenie'],
  [/\bnawozenia\b/g, 'nawożenia'],
  [/\bnawozeniu\b/g, 'nawożeniu'],
  [/\bodzywczych\b/g, 'odżywczych'],
  [/\bodzywiania\b/g, 'odżywiania'],
  [/\bBlad\b/g, 'Błąd'],
  [/\bblad\b/g, 'błąd'],
  [/\bsprobuj\b/g, 'spróbuj'],
  [/\bSprobuj\b/g, 'Spróbuj'],
  [/\bodswiez\b/g, 'odśwież'],
  [/\bOdswiez\b/g, 'Odśwież'],
  [/\bwlacz\b/g, 'włącz'],
  [/\bWlacz\b/g, 'Włącz'],
  [/\bwylacz\b/g, 'wyłącz'],
  [/\bWylacz\b/g, 'Wyłącz'],
  [/\bgrzalka\b/g, 'grzałka'],
  [/\bgrzalki\b/g, 'grzałki'],
  [/\bGrzalka\b/g, 'Grzałka'],
  [/\bpowiazane\b/g, 'powiązane'],
  [/\bwartosci\b/g, 'wartości'],
  [/\bwartosciach\b/g, 'wartościach'],
  [/\bWartosci\b/g, 'Wartości'],
  [/\bnazwe\b/g, 'nazwę'],
  [/\bNazwe\b/g, 'Nazwę'],
  [/\bpojemnosc\b/g, 'pojemność'],
  [/\bpojemnosci\b/g, 'pojemności'],
  [/\bporownywac\b/g, 'porównywać'],
  [/\bliczyc\b/g, 'liczyć'],
  [/\bzostawic\b/g, 'zostawić'],
  [/\bdomyslne\b/g, 'domyślne'],
  [/\brozpoznac\b/g, 'rozpoznać'],
  [/\bmonitorowac\b/g, 'monitorować'],
  [/\bpoczatkujacych\b/g, 'początkujących'],
  [/\bstaly\b/g, 'stały'],
  [/\bstabilnosc\b/g, 'stabilność'],
  [/\bstabilnosci\b/g, 'stabilności'],
  [/\bwrazliwa\b/g, 'wrażliwa'],
  [/\bwrazliwe\b/g, 'wrażliwe'],
  [/\bbezposredni\b/g, 'bezpośredni'],
  [/\bszczegolnie\b/g, 'szczególnie'],
  [/\bszczegoly\b/g, 'szczegóły'],
  [/\bSzczegoly\b/g, 'Szczegóły'],
  [/\bobjawow\b/g, 'objawów'],
  [/\bzle\b/g, 'źle'],
  [/\bZle\b/g, 'Źle'],
  [/\bJager\b/g, 'Jäger'],
];

function polishize(value) {
  let output = value;
  for (const [pattern, replacement] of replacements) {
    output = typeof pattern === 'string'
      ? output.split(pattern).join(replacement)
      : output.replace(pattern, replacement);
  }
  return output;
}

const skipPropertyKeys = new Set([
  'id',
  'type',
  'filterType',
  'imageFileName',
  'imageFallbackFileName',
  'imageUrl',
  'imagePreviewUrl',
  'imageFallbackUrl',
  'imageFallbackPreviewUrl',
  'imageSourceLabel',
  'latinName',
  'source',
  'value',
  'key',
  'icon',
  'screen',
  'route',
  'path',
  'href',
  'collection',
  'field',
  'operator',
  'status',
  'severity',
]);

const methodSkipNames = new Set(['includes', 'startsWith', 'endsWith', 'match', 'test', 'replace']);

function getKeyName(propertyKey) {
  if (!propertyKey) return '';
  if (propertyKey.type === 'Identifier') return propertyKey.name;
  if (propertyKey.type === 'StringLiteral') return propertyKey.value;
  if (propertyKey.type === 'NumericLiteral') return String(propertyKey.value);
  return '';
}

function parentPropertyKey(node) {
  let parent = node.parent;
  while (parent) {
    if (parent.type === 'ObjectProperty' || parent.type === 'Property') {
      return getKeyName(parent.key);
    }
    if (parent.type !== 'ArrayExpression') break;
    parent = parent.parent;
  }
  return '';
}

function shouldSkipString(node) {
  const parent = node.parent;
  if (!parent) return false;
  if ((parent.type === 'ObjectProperty' || parent.type === 'Property') && parent.key === node) return true;
  if (
    parent.type === 'ImportDeclaration' ||
    parent.type === 'ExportNamedDeclaration' ||
    parent.type === 'ExportAllDeclaration' ||
    parent.type === 'ImportSpecifier' ||
    parent.type === 'ImportDefaultSpecifier' ||
    parent.type === 'ImportNamespaceSpecifier'
  ) {
    return true;
  }

  const propertyKey = parentPropertyKey(node);
  if (skipPropertyKeys.has(propertyKey)) return true;
  if (propertyKey === 'symptoms' || propertyKey === 'tags' || propertyKey === 'aliases') return true;

  if (parent.type === 'CallExpression') {
    const callee = parent.callee;
    if (callee && callee.type === 'MemberExpression') {
      const name = callee.property && (callee.property.name || callee.property.value);
      if (methodSkipNames.has(name)) return true;
    }
  }

  if (/^https?:\/\//.test(node.value)) return true;
  if (/^[a-z0-9_./:-]+$/.test(node.value) && !node.value.includes(' ')) return true;
  return false;
}

function walk(node, visitor, parent = null) {
  if (!node || typeof node !== 'object') return;
  node.parent = parent;
  visitor(node);
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range' || key === 'comments' || key === 'tokens') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) walk(item, visitor, node);
    } else if (child && typeof child.type === 'string') {
      walk(child, visitor, node);
    }
  }
}

for (const relativePath of files) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) continue;
  const source = fs.readFileSync(absolutePath, 'utf8');
  let ast;
  try {
    ast = parser.parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
      errorRecovery: true,
    });
  } catch (error) {
    console.error(`Parse failed: ${relativePath}: ${error.message}`);
    continue;
  }

  const edits = [];
  walk(ast, (node) => {
    if (node.type === 'StringLiteral') {
      if (shouldSkipString(node)) return;
      const nextValue = polishize(node.value);
      if (nextValue !== node.value) {
        edits.push({ start: node.start, end: node.end, text: JSON.stringify(nextValue) });
      }
      return;
    }

    if (node.type === 'TemplateElement') {
      const rawChunk = source.slice(node.start, node.end);
      const nextChunk = polishize(rawChunk);
      if (nextChunk !== rawChunk) {
        edits.push({ start: node.start, end: node.end, text: nextChunk });
      }
      return;
    }

    if (node.type === 'JSXText') {
      const rawChunk = source.slice(node.start, node.end);
      const nextChunk = polishize(rawChunk);
      if (nextChunk !== rawChunk) {
        edits.push({ start: node.start, end: node.end, text: nextChunk });
      }
    }
  });

  if (edits.length === 0) continue;
  edits.sort((a, b) => b.start - a.start);
  let output = source;
  for (const edit of edits) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  fs.writeFileSync(absolutePath, output, 'utf8');
  console.log(`${relativePath}: ${edits.length} string fixes`);
}
