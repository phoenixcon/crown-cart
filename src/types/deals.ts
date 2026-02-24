export type RawDealsResponse = {
  data?: {
    products?: RawProduct[];
  };
};

export type RawProduct = {
  id?: string;
  item?: RawItem;
  price?: RawPriceBlock;
  sourceLocations?: RawSourceLocation[];
};

export type RawItem = {
  itemId?: string;
  upc?: string;
  description?: string;
  productName?: string;
  brand?: {
    name?: string;
  };
  categories?: Array<{
    name?: string;
  }>;
  familyTree?: {
    department?: {
      name?: string;
    };
    commodity?: {
      name?: string;
    };
  };
};

export type RawPriceBlock = {
  storePrices?: {
    promo?: RawPriceDetails;
    regular?: RawPriceDetails;
  };
};

export type RawSourceLocation = {
  prices?: Array<{
    sale?: RawPriceDetails & {
      nFor?: RawNForDetails;
    };
    regular?: RawPriceDetails & {
      nFor?: RawNForDetails;
    };
  }>;
};

export type RawPriceDetails = {
  price?: string | null;
  unitPrice?: string | null;
  nforPrice?: string | null;
  defaultDescription?: string | null;
};

export type RawNForDetails = {
  price?: string | null;
};

export type NormalizedDeal = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  regularPrice: number | null;
  salePrice: number | null;
  currency: string | null;
};

export type DealsApiResponse = {
  products: NormalizedDeal[];
  fetchedAt: string;
};
