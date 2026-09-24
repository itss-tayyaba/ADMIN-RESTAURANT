import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../config/app_theme.dart';
import '../models/order_model.dart';
import '../services/api_service.dart';

class TrackingScreen extends StatefulWidget {
  final String? orderNumber;

  const TrackingScreen({Key? key, this.orderNumber}) : super(key: key);

  @override
  State<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends State<TrackingScreen> {
  final _searchController = TextEditingController();
  OrderModel? _currentOrder;
  bool _isLoading = false;
  Timer? _pollTimer;

  final List<String> _stages = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'];
  final Map<String, String> _stageLabels = {
    'pending': 'Order Placed',
    'confirmed': 'Kitchen Confirmed',
    'preparing': 'Chef Cooking',
    'ready': 'Ready for Handover',
    'out_for_delivery': 'Out for Delivery',
    'delivered': 'Delivered / Completed',
  };

  @override
  void initState() {
    super.initState();
    if (widget.orderNumber != null) {
      _searchController.text = widget.orderNumber!;
      _fetchOrder(widget.orderNumber!, isBackground: false);
      _pollTimer = Timer.periodic(const Duration(seconds: 8), (_) {
        if (_searchController.text.isNotEmpty) {
          _fetchOrder(_searchController.text.trim(), isBackground: true);
        }
      });
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _fetchOrder(String orderNum, {bool isBackground = false}) async {
    if (!isBackground) {
      setState(() => _isLoading = true);
    }
    final order = await ApiService.trackOrder(orderNum);
    if (!mounted) return;

    if (order != null) {
      final oldStatus = _currentOrder?.status;
      final newStatus = order.status;

      setState(() {
        _currentOrder = order;
        _isLoading = false;
      });

      // Status change notification & haptic feedback on mobile
      if (oldStatus != null && oldStatus != newStatus) {
        HapticFeedback.heavyImpact();
        _showStatusAlert(order, oldStatus, newStatus);
      }
    } else {
      setState(() => _isLoading = false);
      if (!isBackground) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Order not found. Please verify the order number.'),
          ),
        );
      }
    }
  }

  void _showStatusAlert(OrderModel order, String oldStatus, String newStatus) {
    final title = _stageLabels[newStatus] ?? newStatus;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: const Color(0xFF1A1917),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: AppTheme.gold, width: 1.5),
        ),
        duration: const Duration(seconds: 5),
        content: Row(
          children: [
            const Icon(Icons.notifications_active, color: AppTheme.gold, size: 24),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Order Update: $title',
                    style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.textLight, fontSize: 13),
                  ),
                  Text(
                    'Order #${order.orderNumber} status changed to $title.',
                    style: const TextStyle(color: AppTheme.textMuted, fontSize: 11),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Track Input
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                color: AppTheme.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppTheme.border),
              ),
              child: TextField(
                controller: _searchController,
                style: const TextStyle(color: AppTheme.textLight, fontSize: 14),
                decoration: InputDecoration(
                  icon: const Icon(Icons.receipt_long, color: AppTheme.gold, size: 20),
                  hintText: 'Enter Order Number (e.g. EB-1041)',
                  hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
                  border: InputBorder.none,
                  suffixIcon: IconButton(
                    icon: const Icon(Icons.arrow_forward, color: AppTheme.gold),
                    onPressed: () {
                      if (_searchController.text.trim().isNotEmpty) {
                        _fetchOrder(_searchController.text.trim(), isBackground: false);
                      }
                    },
                  ),
                ),
              ),
            ),
            const SizedBox(height: 20),

            if (_isLoading && _currentOrder == null)
              const Center(child: Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator(color: AppTheme.gold)))
            else if (_currentOrder != null) ...[
              // Order Number Banner
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: AppTheme.surface,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppTheme.gold.withOpacity(0.4)),
                  boxShadow: [
                    BoxShadow(color: Colors.black.withOpacity(0.4), blurRadius: 15),
                  ],
                ),
                child: Column(
                  children: [
                    const Text('LIVE TRACKING', style: TextStyle(color: AppTheme.gold, fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 2)),
                    const SizedBox(height: 4),
                    Text(
                      _currentOrder!.orderNumber,
                      style: const TextStyle(fontFamily: 'Playfair Display', fontSize: 26, fontWeight: FontWeight.w900, color: AppTheme.textLight),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Type: ${_currentOrder!.orderType.toUpperCase()}',
                      style: const TextStyle(color: AppTheme.textMuted, fontSize: 12),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // OTP Code for Delivery
              if (_currentOrder!.otp != null && _currentOrder!.otp!.isNotEmpty)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppTheme.gold.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppTheme.gold),
                  ),
                  child: Column(
                    children: [
                      const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.shield_outlined, color: AppTheme.gold, size: 16),
                          SizedBox(width: 6),
                          Text('DELIVERY HANDOFF OTP CODE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.gold, letterSpacing: 1)),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        _currentOrder!.otp!,
                        style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, letterSpacing: 8, color: AppTheme.textLight),
                      ),
                      const Text('Show this code to your delivery rider upon arrival.', style: TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                    ],
                  ),
                ),
              const SizedBox(height: 16),

              // Assigned Rider Card
              if (_currentOrder!.deliveryBoyName != null && _currentOrder!.deliveryBoyName!.isNotEmpty)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppTheme.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppTheme.border),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          color: AppTheme.gold.withOpacity(0.2),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.two_wheeler, color: AppTheme.gold),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Assigned Rider', style: TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                            Text(_currentOrder!.deliveryBoyName!, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: AppTheme.textLight)),
                            if (_currentOrder!.deliveryBoyPhone != null)
                              Text('Phone: ${_currentOrder!.deliveryBoyPhone!}', style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 20),

              // Journey Timeline
              const Text('Live Order Journey', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: AppTheme.textLight)),
              const SizedBox(height: 12),
              ..._stages.map((stage) {
                final currentIdx = _stages.indexOf(_currentOrder!.status);
                final stageIdx = _stages.indexOf(stage);
                final isDone = stageIdx <= currentIdx;
                final isCurrent = stageIdx == currentIdx;

                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Column(
                      children: [
                        Container(
                          width: 28,
                          height: 28,
                          decoration: BoxDecoration(
                            color: isDone ? AppTheme.gold : AppTheme.surfaceLight,
                            shape: BoxShape.circle,
                            border: Border.all(color: isCurrent ? AppTheme.gold : AppTheme.border),
                          ),
                          child: Icon(
                            isDone ? Icons.check : Icons.circle,
                            size: 14,
                            color: isDone ? AppTheme.bg : AppTheme.textMuted,
                          ),
                        ),
                        if (stage != _stages.last)
                          Container(
                            width: 2,
                            height: 32,
                            color: isDone ? AppTheme.gold : AppTheme.border,
                          ),
                      ],
                    ),
                    const SizedBox(width: 14),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _stageLabels[stage] ?? stage,
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: isCurrent ? FontWeight.bold : FontWeight.normal,
                            color: isCurrent ? AppTheme.gold : isDone ? AppTheme.textLight : AppTheme.textMuted,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          isCurrent ? 'Currently in progress...' : isDone ? 'Completed' : 'Pending next step',
                          style: TextStyle(fontSize: 11, color: isCurrent ? AppTheme.gold.withOpacity(0.8) : AppTheme.textMuted),
                        ),
                      ],
                    ),
                  ],
                );
              }).toList(),
            ] else
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(40),
                  child: Text('Enter your order number above to track status.', style: TextStyle(color: AppTheme.textMuted)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
