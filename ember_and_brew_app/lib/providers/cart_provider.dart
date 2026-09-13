import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/cart_item.dart';
import '../models/menu_item.dart';

class CartProvider extends ChangeNotifier {
  List<CartItemModel> _items = [];

  List<CartItemModel> get items => _items;

  int get totalItemCount => _items.fold(0, (sum, i) => sum + i.qty);

  double get subtotal => _items.fold(0.0, (sum, i) => sum + i.totalPrice);

  double get tax => subtotal * 0.08; // 8% tax

  double get grandTotal => subtotal + tax;

  CartProvider() {
    _loadCart();
  }

  int getItemQuantity(String dishId) {
    final match = _items.firstWhere(
      (i) => i.item.id == dishId,
      orElse: () => CartItemModel(item: MenuItemModel(id: '', name: '', price: 0, description: '', category: '', image: ''), qty: 0),
    );
    return match.qty;
  }

  void addItem(MenuItemModel dish) {
    final idx = _items.indexWhere((i) => i.item.id == dish.id);
    if (idx >= 0) {
      _items[idx].qty += 1;
    } else {
      _items.add(CartItemModel(item: dish, qty: 1));
    }
    _saveCart();
    notifyListeners();
  }

  void decrementItem(String dishId) {
    final idx = _items.indexWhere((i) => i.item.id == dishId);
    if (idx >= 0) {
      if (_items[idx].qty > 1) {
        _items[idx].qty -= 1;
      } else {
        _items.removeAt(idx);
      }
      _saveCart();
      notifyListeners();
    }
  }

  void removeItem(String dishId) {
    _items.removeWhere((i) => i.item.id == dishId);
    _saveCart();
    notifyListeners();
  }

  void clearCart() {
    _items.clear();
    _saveCart();
    notifyListeners();
  }

  Future<void> _saveCart() async {
    final prefs = await SharedPreferences.getInstance();
    final jsonList = _items.map((i) => i.toJson()).toList();
    await prefs.setString('eb_mobile_cart', jsonEncode(jsonList));
  }

  Future<void> _loadCart() async {
    final prefs = await SharedPreferences.getInstance();
    final data = prefs.getString('eb_mobile_cart');
    if (data != null) {
      try {
        final List decoded = jsonDecode(data);
        _items = decoded.map((e) => CartItemModel.fromJson(e)).toList();
        notifyListeners();
      } catch (_) {}
    }
  }
}
