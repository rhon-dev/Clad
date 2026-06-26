export type Category = 'top' | 'bottom' | 'shoes' | 'outerwear' | 'accessory';
export type Occasion = 'casual' | 'work' | 'formal' | 'date' | 'workout';

export interface ClothingItem {
  id: string;
  user_id: string;
  image_url: string;
  category: Category;
  color: string;
  style_tags: string[];
  created_at: string;
}

export interface WeatherData {
  temperature: number;
  description: string;
}

export interface OutfitRecommendation {
  item_ids: string[];
  rationale: string;
}

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  Wardrobe: undefined;
  Upload: undefined;
  Recommend: undefined;
};
