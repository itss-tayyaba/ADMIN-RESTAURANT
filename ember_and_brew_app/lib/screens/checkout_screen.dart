import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../providers/cart_provider.dart';
import '../providers/currency_provider.dart';
import '../services/api_service.dart';
import 'tracking_screen.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({Key? key}) : super(key: key);

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  String _orderType = 'dine-in'; // dine-in, takeaway, delivery
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _tableController = TextEditingController(text: 'T-01');
  final _addressController = TextEditingController();
  bool _isSubmitting = false;

  @override
  Widget build(BuildContext context) {
    final cart = Provider.of<CartProvider>(context);
    final currency = Provider.of<CurrencyProvider>(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Checkout', style: TextStyle(fontFamily: 'Playfair Display', fontWeight: FontWeight.bold)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Order Type Selector
            const Text('Order Type', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: AppTheme.gold)),
            const SizedBox(height: 8),
            Row(
              children: [
                _buildOrderTypeRadio('dine-in', 'Dine In', Icons.restaurant),
                const SizedBox(width: 8),
                _buildOrderTypeRadio('takeaway', 'Takeaway', Icons.shopping_bag),
                const SizedBox(width: 8),
                _buildOrderTypeRadio('delivery', 'Delivery', Icons.delivery_dining),
              ],
            ),
            const SizedBox(height: 20),

            // Contact Info
            const Text('Customer Details', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: AppTheme.gold)),
            const SizedBox(height: 8),
            _buildTextField(_nameController, 'Full Name', Icons.person),
            const SizedBox(height: 10),
            _buildTextField(_phoneController, 'Phone Number', Icons.phone, keyboardType: TextInputType.phone),
            const SizedBox(height: 10),

            if (_orderType == 'dine-in')
              _buildTextField(_tableController, 'Table Number (e.g. T-04)', Icons.table_restaurant),

            if (_orderType == 'delivery')
              _buildTextField(_addressController, 'Delivery Address', Icons.location_on, maxLines: 2),

            const SizedBox(height: 24),

            // Order Summary
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppTheme.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppTheme.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Order Summary', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: AppTheme.textLight)),
                  const SizedBox(height: 12),
                  ...cart.items.map((i) => Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('${i.qty}x ${i.item.name}', style: const TextStyle(color: AppTheme.textMuted, fontSize: 13)),
                            Text(currency.formatPrice(i.totalPrice), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                          ],
                        ),
                      )),
                  const Divider(color: AppTheme.border, height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Total Amount', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                      Text(currency.formatPrice(cart.grandTotal), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: AppTheme.gold)),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Place Order Button
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: _isSubmitting ? null : _handlePlaceOrder,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.gold,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
                child: _isSubmitting
                    ? const CircularProgressIndicator(color: AppTheme.bg)
                    : const Text('Confirm & Place Order', style: TextStyle(color: AppTheme.bg, fontWeight: FontWeight.bold, fontSize: 16)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOrderTypeRadio(String value, String title, IconData icon) {
    final isSelected = _orderType == value;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _orderType = value),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: isSelected ? AppTheme.gold.withOpacity(0.15) : AppTheme.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: isSelected ? AppTheme.gold : AppTheme.border),
          ),
          child: Column(
            children: [
              Icon(icon, size: 20, color: isSelected ? AppTheme.gold : AppTheme.textMuted),
              const SizedBox(height: 4),
              Text(title, style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: isSelected ? AppTheme.gold : AppTheme.textLight)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTextField(TextEditingController controller, String label, IconData icon, {TextInputType? keyboardType, int maxLines = 1}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.border),
      ),
      child: TextField(
        controller: controller,
        keyboardType: keyboardType,
        maxLines: maxLines,
        style: const TextStyle(color: AppTheme.textLight, fontSize: 14),
        decoration: InputDecoration(
          icon: Icon(icon, color: AppTheme.gold, size: 18),
          labelText: label,
          labelStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
          border: InputBorder.none,
        ),
      ),
    );
  }

  Future<void> _handlePlaceOrder() async {
    if (_nameController.text.trim().isEmpty || _phoneController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter your name and phone number')),
      );
      return;
    }

    final cart = Provider.of<CartProvider>(context, listen: false);
    setState(() => _isSubmitting = true);

    final itemsPayload = cart.items.map((i) => {
      'name': i.item.name,
      'price': i.item.price,
      'qty': i.qty,
      'menuItem': i.item.id,
    }).toList();

    final order = await ApiService.placeOrder(
      orderType: _orderType,
      customerName: _nameController.text.trim(),
      customerPhone: _phoneController.text.trim(),
      table: _orderType == 'dine-in' ? _tableController.text.trim() : null,
      address: _orderType == 'delivery' ? _addressController.text.trim() : null,
      items: itemsPayload,
      total: cart.grandTotal,
    );

    setState(() => _isSubmitting = false);

    if (order != null && order.orderNumber.isNotEmpty) {
      cart.clearCart();
      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => TrackingScreen(orderNumber: order.orderNumber)),
        );
      }
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not place order. Please check your connection and try again.'),
            backgroundColor: Colors.redAccent,
          ),
        );
      }
    }
  }
}
