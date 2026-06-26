import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../lib/supabase';
import { ClothingItem, RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function WardrobeScreen() {
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchItems() {
    setLoading(true);
    const { data, error } = await supabase
      .from('clothing_items')
      .select('*')
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      Alert.alert('Error', 'Failed to load wardrobe.');
      return;
    }
    setItems(data ?? []);
  }

  useFocusEffect(
    useCallback(() => {
      fetchItems();
    }, [])
  );

  async function handleDelete(item: ClothingItem) {
    Alert.alert('Delete item?', `Remove this ${item.category} from your wardrobe?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('clothing_items')
            .delete()
            .eq('id', item.id);
          if (error) {
            Alert.alert('Error', 'Failed to delete item.');
          } else {
            setItems((prev) => prev.filter((i) => i.id !== item.id));
          }
        },
      },
    ]);
  }

  function getSignedUrl(item: ClothingItem) {
    // image_url stored as full public URL from signed URL at upload time
    return item.image_url;
  }

  if (!loading && items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>👔</Text>
        <Text style={styles.emptyTitle}>Your wardrobe is empty</Text>
        <Text style={styles.emptyDesc}>
          Add clothing items to get outfit recommendations.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('Upload')}>
          <Text style={styles.btnText}>Add first item</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        numColumns={2}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchItems} />}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onLongPress={() => handleDelete(item)}>
            <Image source={{ uri: getSignedUrl(item) }} style={styles.img} />
            <View style={styles.cardBody}>
              <Text style={styles.category}>{item.category}</Text>
              <Text style={styles.color}>{item.color}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('Upload')}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  grid: { padding: 8 },
  card: {
    flex: 1,
    margin: 6,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    overflow: 'hidden',
  },
  img: { width: '100%', aspectRatio: 0.75, backgroundColor: '#222' },
  cardBody: { padding: 10 },
  category: { color: '#fff', fontWeight: '700', textTransform: 'capitalize', fontSize: 13 },
  color: { color: '#888', fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 32 },
  empty: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  emptyDesc: { color: '#888', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  btn: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
