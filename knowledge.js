const hotelKnowledge = {
  hotel: {
    name: "Laki Hotel & Spa",
    email: "contact@lakihotelspa.com",
    phone: "+389 46 203 333",
    mapsUrl:
      "https://www.google.com/maps/place/Hotel+%26+Spa+%E2%80%9ELaki%E2%80%9C",
    fallbackMessageEn:
      "For accurate information, please contact us at contact@lakihotelspa.com or call +389 46 203 333.",
    fallbackMessageMk:
      "За точни информации, ве молиме контактирајте не на contact@lakihotelspa.com или јавете се на +389 46 203 333.",
  },

  faq: [
    {
      id: "offer",
      keywordsEn: [
        "price","prices","offer","offers","availability","booking","reservation",
        "reserve","rate","rates","cost","quote","book"
      ],
      keywordsMk: [
        "цена","цени","понуда","понуди","достапност",
        "резервација","резервирај","слободно","достапно"
      ],
      textEn:
        "For prices, availability and the best offer, please send us your stay details and we will prepare an offer for you.",
      textMk:
        "За цени, достапност и најдобра понуда, испратете ни ги деталите за престојот и ќе ви подготвиме понуда.",
      triggersInquiryFlow: true,
    },

    {
      id: "rooms",
      keywordsEn: ["room","rooms","apartment","apartments","accommodation","minibar","balcony","crib"],
      keywordsMk: ["соба","соби","апартман","апартмани","мини бар","балкон","креветче"],
      textEn:
        "Laki Hotel & Spa offers comfortable rooms and apartments.\n\n" +
        "- Breakfast is included\n" +
        "- All units have a balcony\n" +
        "- Minibar is available (extra charge)\n" +
        "- Baby crib available on request",
      textMk:
        "Laki Hotel & Spa нуди удобни соби и апартмани.\n\n" +
        "- Појадокот е вклучен\n" +
        "- Сите единици имаат балкон\n" +
        "- Мини бар (се доплаќа)\n" +
        "- Креветче достапно по барање",
    },

    {
      id: "spa",
      keywordsEn: ["spa","wellness","pool","sauna","massage"],
      keywordsMk: ["спа","базен","сауна","масажа"],
      textEn:
        "Spa includes pool, jacuzzi, sauna and more.\n" +
        "Working hours: 11:00 - 21:00\n" +
        "Included in price (may be limited to 2h if busy).",
      textMk:
        "СПА вклучува базен, џакузи, сауна и др.\n" +
        "Работно време: 11:00 - 21:00\n" +
        "Вклучено во цена (може ограничување 2ч ако има гужва).",
    },

    {
      id: "restaurant",
      keywordsEn: ["restaurant","food","breakfast"],
      keywordsMk: ["ресторан","храна","појадок"],
      textEn:
        "Restaurant: 07:00 - 22:00\nBreakfast: 07:00 - 10:00 (included)",
      textMk:
        "Ресторан: 07:00 - 22:00\nПојадок: 07:00 - 10:00 (вклучен)",
    },

    {
      id: "parking",
      keywordsEn: ["parking"],
      keywordsMk: ["паркинг"],
      textEn: "Free outdoor parking available.",
      textMk: "Бесплатен надворешен паркинг.",
    },

    {
      id: "location",
      keywordsEn: ["location","map","where"],
      keywordsMk: ["локација","мапа","каде"],
      textEn:
        "Located in Ohrid, ~15km from airport, near beach.\nGoogle Maps:\nhttps://maps.google.com",
      textMk:
        "Во Охрид, ~15km од аеродром, близу плажа.\nGoogle Maps:\nhttps://maps.google.com",
    },

    {
      id: "contact",
      keywordsEn: ["contact","phone","email"],
      keywordsMk: ["контакт","телефон","мејл"],
      textEn:
        "Contact us:\nEmail: contact@lakihotelspa.com\nPhone: +389 46 203 333",
      textMk:
        "Контакт:\nEmail: contact@lakihotelspa.com\nТелефон: +389 46 203 333",
    },

    {
      id: "wifi",
      keywordsEn: ["wifi","internet"],
      keywordsMk: ["wifi","интернет"],
      textEn: "Free Wi-Fi available.",
      textMk: "Бесплатен Wi-Fi.",
    },

    {
      id: "children_policy",
      keywordsEn: ["children","kids","family"],
      keywordsMk: ["деца","фамилија"],
      textEn:
        "Families are welcome. Send number of guests and ages for best option.",
      textMk:
        "Семејства се добредојдени. Испратете број на гости и возраст.",
    },

    {
      id: "internal_phone",
      keywordsEn: ["internal","room phone","call"],
      keywordsMk: ["внатрешен","телефон од соба"],
      textEn:
        "From your room:\nReception: 0\nRestaurant: 501\nSpa: 502\nPool: 503",
      textMk:
        "Од соба:\nРецепција: 0\nРесторан: 501\nСПА: 502\nБазен: 503",
    },
  ],
};

function getFaqReply(message, language = "en") {
  if (!message) return null;

  const normalizedMessage = message.toLowerCase().trim();

  const matchedFaq = hotelKnowledge.faq.find((item) => {
    const keywords =
      language === "mk" ? item.keywordsMk || [] : item.keywordsEn || [];

    return keywords.some((keyword) =>
      normalizedMessage.includes(keyword)
    );
  });

  if (!matchedFaq) return null;

  return {
    id: matchedFaq.id,
    text: language === "mk" ? matchedFaq.textMk : matchedFaq.textEn,
    triggersInquiryFlow: Boolean(matchedFaq.triggersInquiryFlow),
  };
}

export { hotelKnowledge, getFaqReply };
