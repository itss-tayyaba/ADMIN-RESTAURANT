import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/api_constants.dart';
import '../models/order_model.dart';

class ApiService {
  static Future<OrderModel?> placeOrder({
    required String orderType,
    required String customerName,
    required String customerPhone,
    String? table,
    String? address,
    required List<Map<String, dynamic>> items,
    required double total,
  }) async {
    try {
      final url = Uri.parse(ApiConstants.baseUrl + ApiConstants.ordersEndpoint);
      final body = jsonEncode({
        'orderType': orderType,
        'customerName': customerName,
        'customerPhone': customerPhone,
        'guestName': customerName,
        'guestPhone': customerPhone,
        'table': table,
        'tableNumber': table,
        'address': address,
        'deliveryAddress': address,
        'items': items,
        'total': total,
      });

      final response = await http.post(
        url,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: body,
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = jsonDecode(response.body);
        return OrderModel.fromJson(data);
      }
    } catch (_) {}
    return null;
  }

  static Future<OrderModel?> trackOrder(String orderNumber) async {
    try {
      final cleanNum = orderNumber.trim();
      final url = Uri.parse('${ApiConstants.baseUrl}${ApiConstants.trackOrderEndpoint}/$cleanNum');
      final response = await http.get(
        url,
        headers: {'Accept': 'application/json'},
      );
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return OrderModel.fromJson(data);
      }
    } catch (_) {}
    return null;
  }

  static Future<bool> bookTable({
    required String name,
    required String phone,
    required String email,
    required String date,
    required String time,
    required int guests,
    String? notes,
  }) async {
    try {
      final url = Uri.parse(ApiConstants.baseUrl + ApiConstants.reservationsEndpoint);
      final body = jsonEncode({
        'name': name,
        'phone': phone,
        'email': email,
        'date': date,
        'time': time,
        'guests': guests,
        'notes': notes,
      });

      final response = await http.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: body,
      );

      return response.statusCode == 200 || response.statusCode == 201;
    } catch (_) {
      return false;
    }
  }
}
