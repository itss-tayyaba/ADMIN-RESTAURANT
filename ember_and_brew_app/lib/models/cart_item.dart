import 'menu_item.dart';

class CartItemModel {
  final MenuItemModel item;
  int qty;
  final List<String> addons;

  CartItemModel({
    required this.item,
    this.qty = 1,
    this.addons = const [],
  });

  double get totalPrice => item.price * qty;

  Map<String, dynamic> toJson() => {
    'item': item.toJson(),
    'qty': qty,
    'addons': addons,
  };

  factory CartItemModel.fromJson(Map<String, dynamic> json) {
    return CartItemModel(
      item: MenuItemModel.fromJson(json['item']),
      qty: json['qty'] ?? 1,
      addons: List<String>.from(json['addons'] ?? []),
    );
  }
}
