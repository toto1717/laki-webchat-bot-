const hotelKnowledge = {
  hotel: {
    name: "Laki Hotel & Spa",
    email: "contact@lakihotelspa.com",
    phone: "+389 46 203 333",
    mapsUrl:
      "https://www.google.com/maps/place/Hotel+%26+Spa+%E2%80%9ELaki%E2%80%9C",
    fallbackMessageEn:
      "The hotel team will confirm the exact information for you.",
    fallbackMessageMk:
      "Хотелскиот тим ќе ја потврди точната информација за вас.",
    fallbackMessageSr:
      "Hotelski tim će potvrditi tačnu informaciju za vas.",
    fallbackMessageSq:
      "Ekipi i hotelit do ta konfirmojë informacionin e saktë për ju.",
  },

  faq: [
    {
      id: "offer",
      keywordsEn: [
        "price",
        "prices",
        "offer",
        "offers",
        "availability",
        "booking",
        "reservation",
        "reserve",
        "rate",
        "rates",
        "cost",
        "quote",
        "book",
      ],
      keywordsMk: [
        "цена",
        "цени",
        "понуда",
        "понуди",
        "достапност",
        "резервација",
        "резервирај",
        "слободно",
        "достапно",
      ],
      keywordsSr: [
        "cena",
        "cene",
        "ponuda",
        "ponude",
        "dostupnost",
        "rezervacija",
        "rezervisati",
        "slobodno",
        "slobodan",
        "slobodna",
        "koliko košta",
      ],
      keywordsSq: [
        "çmim",
        "cmim",
        "çmime",
        "cmime",
        "ofertë",
        "oferte",
        "oferta",
        "disponueshmëri",
        "disponueshmeri",
        "rezervim",
        "rezervoj",
        "sa kushton",
        "a keni dhoma",
      ],
      textEn:
        "For an offer, please write your stay dates and number of guests.",
      textMk:
        "За понуда, напишете ги датумите на престој и бројот на гости.",
      textSr:
        "Za ponudu, napišite datume boravka i broj gostiju.",
      textSq:
        "Për ofertë, ju lutemi shkruani datat e qëndrimit dhe numrin e mysafirëve.",
      triggersInquiryFlow: true,
    },

    {
      id: "rooms",
      keywordsEn: [
        "room",
        "rooms",
        "apartment",
        "apartments",
        "accommodation",
        "minibar",
        "balcony",
        "crib",
      ],
      keywordsMk: [
        "соба",
        "соби",
        "апартман",
        "апартмани",
        "мини бар",
        "минибар",
        "балкон",
        "креветче",
      ],
      keywordsSr: [
        "soba",
        "sobe",
        "apartman",
        "apartmani",
        "smeštaj",
        "smestaj",
        "mini bar",
        "minibar",
        "balkon",
        "krevetac",
      ],
      keywordsSq: [
        "dhomë",
        "dhome",
        "dhoma",
        "apartament",
        "apartamente",
        "akomodim",
        "minibar",
        "ballkon",
        "krevat bebe",
      ],
      textEn:
        "Laki Hotel & Spa offers comfortable rooms and apartments.\n\nBreakfast is included, all units have a balcony, minibar is available with extra charge, and baby crib is available on request.",
      textMk:
        "Laki Hotel & Spa нуди удобни соби и апартмани.\n\nПојадокот е вклучен, сите единици имаат балкон, минибарот се доплаќа, а креветче за бебе е достапно по барање.",
      textSr:
        "Laki Hotel & Spa nudi udobne sobe i apartmane.\n\nDoručak je uključen, sve jedinice imaju balkon, minibar se dodatno naplaćuje, a krevetac za bebu je dostupan na zahtev.",
      textSq:
        "Laki Hotel & Spa ofron dhoma dhe apartamente komode.\n\nMëngjesi është i përfshirë, të gjitha njësitë kanë ballkon, minibari paguhet ekstra, ndërsa krevati për bebe është i disponueshëm me kërkesë.",
    },

    {
      id: "spa",
      keywordsEn: ["spa", "wellness", "pool", "sauna", "massage", "jacuzzi"],
      keywordsMk: ["спа", "базен", "сауна", "масажа", "џакузи"],
      keywordsSr: ["spa", "wellness", "bazen", "sauna", "masaža", "masaza", "đakuzi", "djakuzi"],
      keywordsSq: ["spa", "pishinë", "pishine", "sauna", "masazh", "xakuzi", "wellness"],
      textEn:
        "The spa includes pool, jacuzzi, sauna and more.\nWorking hours: 11:00 - 21:00.\nThe spa is included in the stay, but when it is crowded it may be limited to 2 hours per guest.",
      textMk:
        "СПА делот вклучува базен, џакузи, сауна и друго.\nРаботно време: 11:00 - 21:00.\nСПА е вклучено во престојот, но кога има гужва може да биде ограничено на 2 часа по гостин.",
      textSr:
        "SPA deo uključuje bazen, jacuzzi, saunu i drugo.\nRadno vreme: 11:00 - 21:00.\nSPA je uključen u boravak, ali kada je gužva može biti ograničen na 2 sata po gostu.",
      textSq:
        "Pjesa SPA përfshin pishinë, xhakuzi, sauna dhe të tjera.\nOrari: 11:00 - 21:00.\nSPA është i përfshirë në qëndrim, por kur ka shumë mysafirë mund të kufizohet në 2 orë për mysafir.",
    },

    {
      id: "restaurant",
      keywordsEn: ["restaurant", "food", "breakfast", "dinner", "lunch"],
      keywordsMk: ["ресторан", "храна", "појадок", "вечера", "ручек"],
      keywordsSr: ["restoran", "hrana", "doručak", "dorucak", "večera", "vecera", "ručak", "rucak"],
      keywordsSq: ["restorant", "ushqim", "mëngjes", "mengjes", "darkë", "darke", "drekë", "dreke"],
      textEn:
        "Restaurant working hours: 07:00 - 22:00.\nBreakfast: 07:00 - 10:00 and it is included.",
      textMk:
        "Ресторан работи од 07:00 до 22:00.\nПојадок: 07:00 - 10:00 и е вклучен.",
      textSr:
        "Restoran radi od 07:00 do 22:00.\nDoručak: 07:00 - 10:00 i uključen je.",
      textSq:
        "Restoranti punon nga 07:00 deri në 22:00.\nMëngjesi është nga 07:00 - 10:00 dhe është i përfshirë.",
    },

    {
      id: "parking",
      keywordsEn: ["parking", "car park"],
      keywordsMk: ["паркинг"],
      keywordsSr: ["parking", "parkiranje"],
      keywordsSq: ["parking", "parkim"],
      textEn: "Free outdoor parking is available.",
      textMk: "Достапен е бесплатен надворешен паркинг.",
      textSr: "Dostupan je besplatan spoljašnji parking.",
      textSq: "Parkimi i jashtëm është falas.",
    },

    {
      id: "location",
      keywordsEn: ["location", "map", "where", "address", "near"],
      keywordsMk: ["локација", "мапа", "каде", "адреса", "близу"],
      keywordsSr: ["lokacija", "mapa", "gde", "adresa", "blizu"],
      keywordsSq: ["lokacion", "vendndodhje", "hartë", "harte", "ku", "adresë", "adrese", "afër", "afer"],
      textEn:
        "The hotel is located in Ohrid, around 15 km from Ohrid Airport and close to the beach.",
      textMk:
        "Хотелот се наоѓа во Охрид, околу 15 km од аеродромот во Охрид и блиску до плажа.",
      textSr:
        "Hotel se nalazi u Ohridu, oko 15 km od aerodroma Ohrid i blizu plaže.",
      textSq:
        "Hoteli ndodhet në Ohër, rreth 15 km nga Aeroporti i Ohrit dhe afër plazhit.",
    },

    {
      id: "contact",
      keywordsEn: ["contact", "phone", "email", "call"],
      keywordsMk: ["контакт", "телефон", "мејл", "јавам"],
      keywordsSr: ["kontakt", "telefon", "email", "mejl", "poziv"],
      keywordsSq: ["kontakt", "telefon", "email", "mail", "thirrje"],
      textEn:
        "Contact:\nEmail: contact@lakihotelspa.com\nPhone: +389 46 203 333",
      textMk:
        "Контакт:\nEmail: contact@lakihotelspa.com\nТелефон: +389 46 203 333",
      textSr:
        "Kontakt:\nEmail: contact@lakihotelspa.com\nTelefon: +389 46 203 333",
      textSq:
        "Kontakt:\nEmail: contact@lakihotelspa.com\nTelefon: +389 46 203 333",
    },

    {
      id: "wifi",
      keywordsEn: ["wifi", "wi-fi", "internet"],
      keywordsMk: ["wifi", "wi-fi", "интернет"],
      keywordsSr: ["wifi", "wi-fi", "internet"],
      keywordsSq: ["wifi", "wi-fi", "internet"],
      textEn: "Free Wi-Fi is available.",
      textMk: "Достапен е бесплатен Wi-Fi.",
      textSr: "Dostupan je besplatan Wi-Fi.",
      textSq: "Wi-Fi është falas.",
    },

    {
      id: "children_policy",
      keywordsEn: ["children", "kids", "family", "baby"],
      keywordsMk: ["деца", "фамилија", "семејство", "бебе"],
      keywordsSr: ["deca", "djeca", "porodica", "familija", "beba", "dete", "dijete"],
      keywordsSq: ["fëmijë", "femije", "familje", "bebe", "fëmija", "femija"],
      textEn:
        "Families are welcome. For the best offer, please send the number of adults, number of children and children’s ages.",
      textMk:
        "Семејства се добредојдени. За најдобра понуда, внесете број на возрасни, број на деца и возраст на децата.",
      textSr:
        "Porodice su dobrodošle. Za najbolju ponudu, napišite broj odraslih, broj dece i uzrast dece.",
      textSq:
        "Familjet janë të mirëseardhura. Për ofertën më të mirë, shkruani numrin e të rriturve, numrin e fëmijëve dhe moshat e fëmijëve.",
    },

    {
      id: "internal_phone",
      keywordsEn: ["internal", "room phone", "call reception", "call restaurant", "call spa"],
      keywordsMk: ["внатрешен", "телефон од соба", "рецепција", "ресторан", "спа"],
      keywordsSr: ["interni", "telefon iz sobe", "recepcija", "restoran", "spa"],
      keywordsSq: ["telefon i brendshëm", "telefon i brendshem", "recepsion", "restorant", "spa"],
      textEn:
        "From your room you can call directly:\nReception: 0\nRestaurant: 501\nSpa center: 502\nPool: 503\nKitchen: 504",
      textMk:
        "Од соба можете директно да се јавите:\nРецепција: 0\nРесторан: 501\nСПА центар: 502\nБазен: 503\nКујна: 504",
      textSr:
        "Iz sobe možete direktno pozvati:\nRecepcija: 0\nRestoran: 501\nSPA centar: 502\nBazen: 503\nKuhinja: 504",
      textSq:
        "Nga dhoma mund të telefononi direkt:\nRecepsioni: 0\nRestoranti: 501\nSPA qendra: 502\nPishina: 503\nKuzhina: 504",
    },
  ],
};

function getTextByLanguage(item, language = "en") {
  if (language === "mk") return item.textMk || item.textEn;
  if (language === "sr") return item.textSr || item.textEn;
  if (language === "sq") return item.textSq || item.textEn;
  return item.textEn;
}

function getKeywordsByLanguage(item, language = "en") {
  if (language === "mk") return item.keywordsMk || [];
  if (language === "sr") return item.keywordsSr || [];
  if (language === "sq") return item.keywordsSq || [];
  return item.keywordsEn || [];
}

function getFaqReply(message, language = "en") {
  if (!message) return null;

  const normalizedMessage = message.toLowerCase().trim();

  const matchedFaq = hotelKnowledge.faq.find((item) => {
    const keywords = getKeywordsByLanguage(item, language);

    return keywords.some((keyword) =>
      normalizedMessage.includes(keyword.toLowerCase())
    );
  });

  if (!matchedFaq) return null;

  return {
    id: matchedFaq.id,
    text: getTextByLanguage(matchedFaq, language),
    triggersInquiryFlow: Boolean(matchedFaq.triggersInquiryFlow),
  };
}

export { hotelKnowledge, getFaqReply };
