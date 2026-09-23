class OrderModel {
  final String orderNumber;
  final String status; // pending, confirmed, preparing, ready, out_for_delivery, delivered, completed, cancelled
  final String orderType; // dine-in, takeaway, delivery
  final double total;
  final String? table;
  final String? otp;
  final DateTime createdAt;
  final List<dynamic> items;

  OrderModel({
    required this.orderNumber,
    required this.status,
    required this.orderType,
    required this.total,
    this.table,
    this.otp,
    required this.createdAt,
    required this.items,
  });

  factory OrderModel.fromJson(Map<String, dynamic> json) {
    String rawStatus = (json['status'] ?? 'pending').toString().toLowerCase().trim();
    String normalizedStatus = rawStatus;
    if (rawStatus == 'pending_admin' || rawStatus == 'pending_kitchen') {
      normalizedStatus = 'pending';
    } else if (rawStatus == 'received') {
      normalizedStatus = 'confirmed';
    } else if (rawStatus == 'out-for-delivery') {
      normalizedStatus = 'out_for_delivery';
    } else if (rawStatus == 'completed') {
      normalizedStatus = 'delivered';
    }

    return OrderModel(
      orderNumber: json['orderNumber'] ?? json['id'] ?? '',
      status: normalizedStatus,
      orderType: json['orderType'] ?? 'dine-in',
      total: (json['total'] is num) ? (json['total'] as num).toDouble() : 0.0,
      table: (json['table'] ?? json['tableNumber'])?.toString(),
      otp: json['otp']?.toString(),
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt']) ?? DateTime.now()
          : DateTime.now(),
      items: json['items'] ?? [],
    );
  }
}
