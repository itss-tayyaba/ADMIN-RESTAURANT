class MenuItemModel {
  final String id;
  final String name;
  final double price; // in PKR base
  final String description;
  final String category;
  final String image;
  final bool popular;

  MenuItemModel({
    required this.id,
    required this.name,
    required this.price,
    required this.description,
    required this.category,
    required this.image,
    this.popular = false,
  });

  factory MenuItemModel.fromJson(Map<String, dynamic> json) {
    return MenuItemModel(
      id: json['id']?.toString() ?? json['_id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      price: (json['price'] is num) ? (json['price'] as num).toDouble() : 0.0,
      description: json['desc']?.toString() ?? json['description']?.toString() ?? '',
      category: json['cat']?.toString() ?? json['category']?.toString() ?? 'Special',
      image: json['img']?.toString() ?? json['image']?.toString() ?? '/images/Espresso.jpeg',
      popular: json['popular'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'price': price,
    'desc': description,
    'cat': category,
    'img': image,
    'popular': popular,
  };
}
