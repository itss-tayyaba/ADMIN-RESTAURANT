import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../config/api_constants.dart';
import '../models/menu_item.dart';

class MenuProvider extends ChangeNotifier {
  List<MenuItemModel> _allDishes = [];
  String _selectedCategory = 'All';
  String _searchQuery = '';
  bool _isLoading = false;

  List<MenuItemModel> get allDishes => _allDishes;
  String get selectedCategory => _selectedCategory;
  bool get isLoading => _isLoading;

  final List<String> categories = [
    'All',
    'Bakery',
    'Coffee',
    'Desi',
    'Fast Food',
    'Pizza',
    'Desserts',
    'Drinks',
    'Salads',
    'Sandwiches',
  ];

  List<MenuItemModel> get filteredDishes {
    return _allDishes.where((dish) {
      final matchesCategory = _selectedCategory == 'All' ||
          dish.category.toLowerCase().trim() == _selectedCategory.toLowerCase().trim();
      final matchesSearch = _searchQuery.isEmpty ||
          dish.name.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          dish.description.toLowerCase().contains(_searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    }).toList();
  }

  MenuProvider() {
    _initDefaultMenu();
    fetchMenuFromApi();
  }

  void selectCategory(String cat) {
    _selectedCategory = cat;
    notifyListeners();
  }

  void setSearchQuery(String query) {
    _searchQuery = query;
    notifyListeners();
  }

  Future<void> fetchMenuFromApi() async {
    _isLoading = true;
    notifyListeners();
    try {
      final response = await http.get(Uri.parse(ApiConstants.baseUrl + ApiConstants.menuEndpoint));
      if (response.statusCode == 200) {
        final List data = jsonDecode(response.body);
        if (data.isNotEmpty) {
          _allDishes = data.map((json) => MenuItemModel.fromJson(json)).toList();
        }
      }
    } catch (_) {}
    _isLoading = false;
    notifyListeners();
  }

  void _initDefaultMenu() {
    _allDishes = [
      // Desi
      MenuItemModel(id: 'biryani', name: 'Chicken Biryani', price: 750, category: 'Desi', description: 'Fragrant basmati rice layered with tender chicken, aromatic spices, and saffron.', image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600'),
      MenuItemModel(id: 'karahi', name: 'Chicken Karahi', price: 1650, category: 'Desi', description: 'Tender chicken cooked in a traditional wok with fresh tomatoes, ginger, and garlic.', image: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600'),
      MenuItemModel(id: 'kebab', name: 'Seekh Kebab', price: 950, category: 'Desi', description: 'Minced beef kebabs seasoned with fragrant spices, skewered and char-grilled.', image: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=600'),
      MenuItemModel(id: 'haleem', name: 'Haleem', price: 800, category: 'Desi', description: 'Slow-cooked stew of shredded beef, lentils, and cracked wheat.', image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600'),
      MenuItemModel(id: 'kofta', name: 'Kofta Curry', price: 950, category: 'Desi', description: 'Spiced meatballs simmered in a velvety onion-yogurt gravy.', image: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600'),
      MenuItemModel(id: 'mutton_pulao', name: 'Mutton Pulao', price: 1150, category: 'Desi', description: 'Delicate long-grain rice simmered in rich mutton broth with tender cuts.', image: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=600'),
      MenuItemModel(id: 'kabuli_pulao', name: 'Kabuli Pulao', price: 1150, category: 'Desi', description: 'Traditional Afghan rice topped with caramelized carrots, raisins, and nuts.', image: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=600'),
      MenuItemModel(id: 'aloo_palak', name: 'Aloo Palak', price: 650, category: 'Desi', description: 'Comforting spinach and potato curry with ginger and toasted cumin.', image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600'),

      // Fast Food & Burgers
      MenuItemModel(id: 'beef_fries', name: 'Loaded Beef Fries', price: 850, category: 'Fast Food', description: 'Crispy seasoned fries loaded with cheese, minced beef, and signature sauce.', image: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600'),
      MenuItemModel(id: 'creamy_burger', name: 'Creamy Beef Burger', price: 1150, category: 'Fast Food', description: 'Juicy smashed beef patty with creamy garlic mushroom sauce and cheddar.', image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600'),
      MenuItemModel(id: 'crispy_burger', name: 'Crispy Chicken Burger', price: 950, category: 'Fast Food', description: 'Golden fried chicken breast fillet with spicy mayo, pickles, and brioche bun.', image: 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?w=600'),
      MenuItemModel(id: 'spicy_burger', name: 'Spicy Crispy Chicken Burger', price: 1050, category: 'Fast Food', description: 'Fiery crispy chicken with jalapeño slaw and sriracha glaze.', image: 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?w=600'),

      // Pizzas
      MenuItemModel(id: 'pizza_four_cheese', name: 'Four Cheese Pizza', price: 1850, category: 'Pizza', description: 'Mozzarella, gorgonzola, fontina, and parmesan with garlic oil.', image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600'),
      MenuItemModel(id: 'pizza_margherita', name: 'Margherita Pizza', price: 1450, category: 'Pizza', description: 'San Marzano tomato base, fresh buffalo mozzarella, and basil.', image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600'),
      MenuItemModel(id: 'pizza_pepperoni', name: 'Pepperoni Pizza', price: 1750, category: 'Pizza', description: 'Artisan spicy beef pepperoni with rich tomato sauce and melted mozzarella.', image: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=600'),
      MenuItemModel(id: 'pizza_bbq', name: 'BBQ Chicken Pizza', price: 1750, category: 'Pizza', description: 'Smoky grilled chicken, caramelized red onion, BBQ drizzle, and cilantro.', image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600'),

      // Coffee
      MenuItemModel(id: 'cappuccino', name: 'Cappuccino', price: 750, category: 'Coffee', description: 'Equal parts espresso, steamed milk, and velvety microfoam.', image: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=600'),
      MenuItemModel(id: 'cold_brew', name: 'Cold Brew', price: 850, category: 'Coffee', description: '16-hour slow steeped cold extraction. Smooth, low acid, rich notes.', image: 'https://images.unsplash.com/photo-1517701608979-ab0b10ff1747?w=600'),
      MenuItemModel(id: 'espresso', name: 'Espresso', price: 550, category: 'Coffee', description: 'Double shot of our house roasted beans with thick golden crema.', image: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0d04b?w=600'),
      MenuItemModel(id: 'matcha_latte', name: 'Matcha Latte', price: 890, category: 'Coffee', description: 'Ceremonial grade Uji matcha whisked with steamed oat milk.', image: 'https://images.unsplash.com/photo-1515823064-d6e0ac046371?w=600'),
      MenuItemModel(id: 'mocha', name: 'Mocha', price: 850, category: 'Coffee', description: 'Dark chocolate ganache folded into double espresso and warm milk.', image: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=600'),

      // Bakery & Pastries
      MenuItemModel(id: 'almond_danish', name: 'Almond Danish', price: 650, category: 'Bakery', description: 'Flaky pastry filled with frangipane cream and sliced roasted almonds.', image: 'https://images.unsplash.com/photo-1558961363-fa8bdf8c8041?w=600'),
      MenuItemModel(id: 'blueberry_muffin', name: 'Blueberry Muffin', price: 550, category: 'Bakery', description: 'Bursting with wild blueberries, finished with crunchy brown sugar streusel.', image: 'https://images.unsplash.com/photo-1607958996336-41aef7caf765?w=600'),
      MenuItemModel(id: 'croissant', name: 'Butter Croissant', price: 550, category: 'Bakery', description: '72-hour laminated French pastry with rich golden layers.', image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600'),
      MenuItemModel(id: 'cinnamon_roll', name: 'Cinnamon Roll', price: 650, category: 'Bakery', description: 'Warm spiced roll with brown sugar filling and whipped cream cheese glaze.', image: 'https://images.unsplash.com/photo-1608198092390-e6b1b4c87c55?w=600'),

      // Desserts
      MenuItemModel(id: 'lava_cake', name: 'Chocolate Lava Cake', price: 1300, category: 'Desserts', description: 'Warm Belgian chocolate cake with a molten center and vanilla gelato.', image: 'https://images.unsplash.com/photo-1606312507406-b31c4aa38764?w=600'),
      MenuItemModel(id: 'creme_brulee', name: 'Crème Brûlée', price: 1150, category: 'Desserts', description: 'Silky vanilla bean custard with a crisp caramelized sugar crust.', image: 'https://images.unsplash.com/photo-157187722720071-e3123614bb033?w=600'),
      MenuItemModel(id: 'tiramisu', name: 'Tiramisu', price: 1150, category: 'Desserts', description: 'Traditional Italian recipe with espresso ladyfingers and mascarpone.', image: 'https://images.unsplash.com/photo-157187722720071-e3123614bb033?w=600'),

      // Sandwiches & Salads
      MenuItemModel(id: 'turkey_club', name: 'Turkey Club', price: 1350, category: 'Sandwiches', description: 'Smoked turkey, crispy beef bacon, avocado, and herb aioli on sourdough.', image: 'https://images.unsplash.com/photo-1553909482-3874c7c7a313?w=600'),
      MenuItemModel(id: 'caesar_salad', name: 'Caesar Salad', price: 1150, category: 'Salads', description: 'Crisp romaine, shaved parmesan, garlic croutons, and house dressing.', image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600'),
    ];
  }
}
