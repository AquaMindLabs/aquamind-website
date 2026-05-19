const DEFAULT_PROFILE = Object.freeze({
  phMin: 6.4,
  phMax: 7.6,
  ghMin: 4,
  ghMax: 16,
  tempMin: 22,
  tempMax: 27,
  minLiters: 60,
  aggressionLevel: 'peaceful',
  notes:
    'Profil orientacyjny. Zweryfikuj wymagania gatunku pod konkretna odmiane i obsade.',
});

function buildFishEntry(commonName, latinName, overrides = {}) {
  return {
    commonName,
    latinName,
    ...DEFAULT_PROFILE,
    ...overrides,
  };
}

export const FISH_CATALOG_EXPANDED = [
  buildFishEntry('Gupik pawie oczko', 'Poecilia reticulata'),
  buildFishEntry('Gupik Endlera', 'Poecilia wingei', { minLiters: 45 }),
  buildFishEntry('Skalar', 'Pterophyllum scalare', {
    minLiters: 200,
    tempMin: 24,
    tempMax: 30,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Kirys pstry', 'Corydoras paleatus', {
    isSchooling: true,
    minGroupSize: 6,
    tempMin: 20,
    tempMax: 26,
  }),
  buildFishEntry('Zbrojnik pospolity', 'Pterygoplichthys gibbiceps', {
    minLiters: 300,
    tempMin: 23,
    tempMax: 29,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Kosiarka', 'Crossocheilus siamensis', {
    minLiters: 112,
    isSchooling: true,
    minGroupSize: 5,
  }),
  buildFishEntry('Brzanka sumatrzańska', 'Puntigrus tetrazona', {
    minLiters: 90,
    isSchooling: true,
    minGroupSize: 8,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Tęczanka neonowa', 'Melanotaenia praecox', {
    minLiters: 100,
    isSchooling: true,
    minGroupSize: 6,
  }),
  buildFishEntry('Welon', 'Carassius auratus', {
    minLiters: 120,
    tempMin: 18,
    tempMax: 24,
    ghMin: 6,
    ghMax: 18,
  }),
  buildFishEntry('Krewetka Neocaridina davidi', 'Neocaridina davidi', {
    minLiters: 20,
    tempMin: 20,
    tempMax: 26,
  }),
  buildFishEntry('Ślimak Helenka', 'Anentome helena', {
    minLiters: 20,
    tempMin: 22,
    tempMax: 28,
  }),
  buildFishEntry('Ślimak Neritina', 'Neritina pulligera', {
    minLiters: 20,
  }),
  buildFishEntry('Ślimak Ampularia', 'Pomacea diffusa', {
    minLiters: 40,
  }),
  buildFishEntry('Ślimak zatoczek', 'Planorbella duryi', {
    minLiters: 15,
  }),
  buildFishEntry('Ślimak rozdętka', 'Physella acuta', {
    minLiters: 15,
  }),
  buildFishEntry('Ślimak świderka', 'Melanoides tuberculata', {
    minLiters: 15,
  }),
  buildFishEntry('Bystrzyk ozdobny', 'Hyphessobrycon bentosi', {
    isSchooling: true,
    minGroupSize: 8,
  }),
  buildFishEntry('Neon simulans', 'Paracheirodon simulans', {
    isSchooling: true,
    minGroupSize: 8,
    phMin: 5.0,
    phMax: 7.0,
    ghMin: 1,
    ghMax: 8,
    tempMin: 24,
    tempMax: 29,
  }),
  buildFishEntry('Neon zielony', 'Paracheirodon simulans', {
    isSchooling: true,
    minGroupSize: 8,
    phMin: 5.0,
    phMax: 7.0,
    ghMin: 1,
    ghMax: 8,
    tempMin: 24,
    tempMax: 29,
  }),
  buildFishEntry('Razbora borneańska', 'Boraras urophthalmoides', {
    minLiters: 30,
    isSchooling: true,
    minGroupSize: 10,
    tempMin: 23,
    tempMax: 28,
  }),
  buildFishEntry('Razbora brigittae', 'Boraras brigittae', {
    minLiters: 30,
    isSchooling: true,
    minGroupSize: 10,
    tempMin: 23,
    tempMax: 28,
  }),
  buildFishEntry('Razbora maculata', 'Boraras maculatus', {
    minLiters: 30,
    isSchooling: true,
    minGroupSize: 10,
    tempMin: 23,
    tempMax: 28,
  }),
  buildFishEntry('Microrasbora kubotai', 'Microdevario kubotai', {
    minLiters: 45,
    isSchooling: true,
    minGroupSize: 10,
  }),
  buildFishEntry('Zwinnik czerwonousty', 'Hemigrammus rhodostomus', {
    isSchooling: true,
    minGroupSize: 10,
    minLiters: 100,
  }),
  buildFishEntry('Zwinnik Blehera', 'Hemigrammus bleheri', {
    isSchooling: true,
    minGroupSize: 10,
    minLiters: 100,
  }),
  buildFishEntry('Zwinnik latarnik', 'Hemigrammus ocellifer', {
    isSchooling: true,
    minGroupSize: 8,
  }),
  buildFishEntry('Zwinnik miedziany', 'Hasemania nana', {
    isSchooling: true,
    minGroupSize: 8,
  }),
  buildFishEntry('Bystrzyk Axelroda', 'Hyphessobrycon axelrodi', {
    isSchooling: true,
    minGroupSize: 8,
  }),
  buildFishEntry('Bystrzyk czerwony', 'Hyphessobrycon flammeus', {
    isSchooling: true,
    minGroupSize: 8,
  }),
  buildFishEntry('Bystrzyk kolumbijski', 'Hyphessobrycon columbianus', {
    isSchooling: true,
    minGroupSize: 8,
  }),
  buildFishEntry('Pstrążenica marmurkowa', 'Trichopodus trichopterus', {
    minLiters: 112,
    tempMin: 24,
    tempMax: 29,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Pstrążenica srebrzysta', 'Trichopodus trichopterus var. silver', {
    minLiters: 112,
    tempMin: 24,
    tempMax: 29,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Żałobniczka', 'Gymnocorymbus ternetzi', {
    isSchooling: true,
    minGroupSize: 8,
  }),
  buildFishEntry('Hokejówka amazońska', 'Thayeria boehlkei', {
    isSchooling: true,
    minGroupSize: 8,
    minLiters: 80,
  }),
  buildFishEntry('Akara z Maroni', 'Cleithracara maronii', {
    minLiters: 120,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Pielęgniczka agassiza', 'Apistogramma agassizii', {
    minLiters: 80,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Pielęgniczka hongsloi', 'Apistogramma hongsloi', {
    minLiters: 80,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Pielęgniczka panduro', 'Apistogramma panduro', {
    minLiters: 80,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Muszlowiec wielopręgi', 'Neolamprologus multifasciatus', {
    minLiters: 60,
    phMin: 7.6,
    phMax: 8.8,
    ghMin: 8,
    ghMax: 22,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Muszlowiec krótki', 'Neolamprologus brevis', {
    minLiters: 80,
    phMin: 7.6,
    phMax: 8.8,
    ghMin: 8,
    ghMax: 22,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Pyszczak maingano', 'Melanochromis cyaneorhabdos', {
    minLiters: 200,
    phMin: 7.6,
    phMax: 8.6,
    ghMin: 8,
    ghMax: 20,
    aggressionLevel: 'aggressive',
  }),
  buildFishEntry('Pyszczak demasoni', 'Chindongo demasoni', {
    minLiters: 200,
    phMin: 7.6,
    phMax: 8.6,
    ghMin: 8,
    ghMax: 20,
    aggressionLevel: 'aggressive',
  }),
  buildFishEntry('Pyszczak rdzawy', 'Iodotropheus sprengerae', {
    minLiters: 180,
    phMin: 7.6,
    phMax: 8.6,
    ghMin: 8,
    ghMax: 20,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Naskalnik Marliera', 'Julidochromis marlieri', {
    minLiters: 150,
    phMin: 7.8,
    phMax: 8.8,
    ghMin: 10,
    ghMax: 22,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Księżniczka z Burundi', 'Neolamprologus brichardi', {
    minLiters: 150,
    phMin: 7.8,
    phMax: 8.8,
    ghMin: 10,
    ghMax: 22,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Tropheus duboisi', 'Tropheus duboisi', {
    minLiters: 300,
    phMin: 7.8,
    phMax: 8.8,
    ghMin: 10,
    ghMax: 24,
    aggressionLevel: 'aggressive',
  }),
  buildFishEntry('Tropheus moorii', 'Tropheus moorii', {
    minLiters: 350,
    phMin: 7.8,
    phMax: 8.8,
    ghMin: 10,
    ghMax: 24,
    aggressionLevel: 'aggressive',
  }),
  buildFishEntry('Gurami całujący', 'Helostoma temminckii', {
    minLiters: 200,
    tempMin: 24,
    tempMax: 30,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Gurami czekoladowy', 'Sphaerichthys osphromenoides', {
    minLiters: 80,
    phMin: 4.5,
    phMax: 6.8,
    ghMin: 1,
    ghMax: 8,
    tempMin: 24,
    tempMax: 30,
  }),
  buildFishEntry('Gurami perłowy', 'Trichopodus leerii', {
    minLiters: 120,
    tempMin: 24,
    tempMax: 29,
  }),
  buildFishEntry('Trichopsis pumila', 'Trichopsis pumila', {
    minLiters: 45,
    tempMin: 24,
    tempMax: 28,
  }),
  buildFishEntry('Bojownik imbellis', 'Betta imbellis', {
    minLiters: 45,
    tempMin: 24,
    tempMax: 29,
  }),
  buildFishEntry('Bojownik smaragdina', 'Betta smaragdina', {
    minLiters: 60,
    tempMin: 24,
    tempMax: 30,
  }),
  buildFishEntry('Sum szklisty', 'Kryptopterus vitreolus', {
    minLiters: 120,
    isSchooling: true,
    minGroupSize: 6,
  }),
  buildFishEntry('Sum rekini', 'Pangasianodon hypophthalmus', {
    minLiters: 500,
    isSchooling: true,
    minGroupSize: 3,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Synodontis petricola', 'Synodontis petricola', {
    minLiters: 150,
    phMin: 7.2,
    phMax: 8.6,
    ghMin: 8,
    ghMax: 22,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Giętkoząb wielkopłetwy', 'Mastacembelus erythrotaenia', {
    minLiters: 400,
    aggressionLevel: 'aggressive',
  }),
  buildFishEntry('Zbrojnik L144', 'Ancistrus sp. L144', {
    minLiters: 100,
  }),
  buildFishEntry('Zbrojnik L183', 'Ancistrus dolichopterus L183', {
    minLiters: 120,
  }),
  buildFishEntry('Zbrojnik L201', 'Hypancistrus inspector L201', {
    minLiters: 120,
  }),
  buildFishEntry('Zbrojnik L333', 'Hypancistrus sp. L333', {
    minLiters: 120,
  }),
  buildFishEntry('Zbrojnik L046', 'Hypancistrus zebra', {
    minLiters: 120,
    tempMin: 27,
    tempMax: 31,
  }),
  buildFishEntry('Otosek zebra', 'Otocinclus cocama', {
    minLiters: 90,
    isSchooling: true,
    minGroupSize: 6,
  }),
  buildFishEntry('Farlowella', 'Farlowella acus', {
    minLiters: 120,
  }),
  buildFishEntry('Sturisoma', 'Sturisoma aureum', {
    minLiters: 150,
  }),
  buildFishEntry('Cierniooczek Myersa', 'Pangio myersi', {
    minLiters: 80,
    isSchooling: true,
    minGroupSize: 6,
  }),
  buildFishEntry('Badis badis', 'Badis badis', {
    minLiters: 60,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Dario dario', 'Dario dario', {
    minLiters: 35,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Afiosemion gardneri', 'Aphyosemion gardneri', {
    minLiters: 40,
  }),
  buildFishEntry('Fundulopanchax gardneri', 'Fundulopanchax gardneri', {
    minLiters: 50,
  }),
  buildFishEntry('Szczupieńczyk karłowaty', 'Epiplatys annulatus', {
    minLiters: 35,
  }),
  buildFishEntry('Ryżanka japońska', 'Oryzias latipes', {
    minLiters: 45,
    tempMin: 18,
    tempMax: 26,
  }),
  buildFishEntry('Medaka', 'Oryzias latipes', {
    minLiters: 45,
    tempMin: 18,
    tempMax: 26,
  }),
  buildFishEntry('Krewetka Taiwan Bee', 'Caridina cf. cantonensis var. taiwan bee', {
    minLiters: 25,
    phMin: 5.6,
    phMax: 6.8,
    ghMin: 3,
    ghMax: 8,
    tempMin: 20,
    tempMax: 24,
  }),
  buildFishEntry('Krewetka filtrująca Atya gabonensis', 'Atya gabonensis', {
    minLiters: 80,
  }),
  buildFishEntry('Krab wampir', 'Geosesarma dennerle', {
    minLiters: 45,
    aggressionLevel: 'semi_aggressive',
    notes:
      'Gatunek paludaryjny. Wymaga strefy ladowej i wilgotnego powietrza.',
  }),
  buildFishEntry('Zwinnik jarzeniec', 'Hemigrammus erythrozonus', {
    isSchooling: true,
    minGroupSize: 8,
  }),
  buildFishEntry('Razbora galaxy', 'Danio margaritatus', {
    minLiters: 45,
    isSchooling: true,
    minGroupSize: 10,
  }),
  buildFishEntry('Razbora espei', 'Trigonostigma espei', {
    minLiters: 60,
    isSchooling: true,
    minGroupSize: 8,
  }),
  buildFishEntry('Danio perłowy', 'Danio albolineatus', {
    minLiters: 80,
    isSchooling: true,
    minGroupSize: 8,
  }),
  buildFishEntry('Prętnik trójbarwny', 'Trichogaster fasciata', {
    minLiters: 100,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Gurami dwuplamy', 'Trichopodus trichopterus', {
    minLiters: 112,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Paletka', 'Symphysodon aequifasciatus', {
    minLiters: 250,
    phMin: 5.5,
    phMax: 7.0,
    ghMin: 1,
    ghMax: 8,
    tempMin: 28,
    tempMax: 31,
  }),
  buildFishEntry('Pielęgniczka kakadu', 'Apistogramma cacatuoides', {
    minLiters: 80,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Pielęgniczka borelli', 'Apistogramma borellii', {
    minLiters: 80,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Pyszczak yellow', 'Labidochromis caeruleus', {
    minLiters: 200,
    phMin: 7.6,
    phMax: 8.6,
    ghMin: 8,
    ghMax: 20,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Pyszczak zebra', 'Maylandia zebra', {
    minLiters: 250,
    phMin: 7.6,
    phMax: 8.6,
    ghMin: 8,
    ghMax: 20,
    aggressionLevel: 'aggressive',
  }),
  buildFishEntry('Kirys karłowaty', 'Corydoras habrosus', {
    minLiters: 45,
    isSchooling: true,
    minGroupSize: 8,
  }),
  buildFishEntry('Kirysek pigmej', 'Corydoras pygmaeus', {
    minLiters: 45,
    isSchooling: true,
    minGroupSize: 8,
  }),
  buildFishEntry('Grubowarg syjamski', 'Crossocheilus oblongus', {
    minLiters: 112,
    isSchooling: true,
    minGroupSize: 5,
  }),
  buildFishEntry('Bocja wspaniała', 'Chromobotia macracanthus', {
    minLiters: 300,
    isSchooling: true,
    minGroupSize: 5,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Bocja karłowata', 'Ambastaia sidthimunki', {
    minLiters: 90,
    isSchooling: true,
    minGroupSize: 6,
    aggressionLevel: 'semi_aggressive',
  }),
  buildFishEntry('Brzanka różowa', 'Pethia conchonius', {
    minLiters: 100,
    isSchooling: true,
    minGroupSize: 8,
  }),
  buildFishEntry('Brzanka wysmukła', 'Sahyadria denisonii', {
    minLiters: 250,
    isSchooling: true,
    minGroupSize: 6,
  }),
  buildFishEntry('Tęczanka Boesemana', 'Melanotaenia boesemani', {
    minLiters: 180,
    isSchooling: true,
    minGroupSize: 6,
  }),
  buildFishEntry('Krewetka Crystal Black', 'Caridina cf. cantonensis var. black', {
    minLiters: 25,
    phMin: 5.6,
    phMax: 6.8,
    ghMin: 3,
    ghMax: 8,
    tempMin: 20,
    tempMax: 24,
  }),
  buildFishEntry('Krewetka filtrująca Atyopsis moluccensis', 'Atyopsis moluccensis', {
    minLiters: 60,
  }),
  buildFishEntry('Ślimak Clithon', 'Clithon corona', {
    minLiters: 20,
  }),
  buildFishEntry('Ślimak Military Helmet', 'Neritina militaris', {
    minLiters: 20,
  }),
  buildFishEntry('Ślimak Tylomelania', 'Tylomelania sp.', {
    minLiters: 60,
    tempMin: 25,
    tempMax: 30,
  }),
  buildFishEntry('Raczek CPO', 'Cambarellus patzcuarensis orange', {
    minLiters: 45,
    aggressionLevel: 'semi_aggressive',
  }),
];
