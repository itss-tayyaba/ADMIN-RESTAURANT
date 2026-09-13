import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../providers/cart_provider.dart';
import '../providers/currency_provider.dart';
import 'menu_screen.dart';
import 'cart_screen.dart';
import 'tracking_screen.dart';
import 'reservation_screen.dart';
import 'profile_screen.dart';

class MainLayout extends StatefulWidget {
  const MainLayout({Key? key}) : super(key: key);

  @override
  State<MainLayout> createState() => _MainLayoutState();
}

class _MainLayoutState extends State<MainLayout> {
  int _currentIndex = 0;

  final List<Widget> _screens = [
    const MenuScreen(),
    const TrackingScreen(),
    const ReservationScreen(),
    const ProfileScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    final cart = Provider.of<CartProvider>(context);
    final currency = Provider.of<CurrencyProvider>(context);

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: AppTheme.gold, width: 1.5),
              ),
              child: ClipOval(
                child: Image.asset(
                  'assets/images/app-logo.png',
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const Icon(Icons.coffee, size: 16, color: AppTheme.gold),
                ),
              ),
            ),
            const SizedBox(width: 8),
            const Text(
              'Ember & Brew',
              style: TextStyle(
                fontFamily: 'Playfair Display',
                fontWeight: FontWeight.bold,
                fontSize: 18,
                color: AppTheme.textLight,
              ),
            ),
          ],
        ),
        actions: [
          // Currency Switcher Dropdown
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              decoration: BoxDecoration(
                color: AppTheme.surfaceLight,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppTheme.border),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: currency.currencyCode,
                  dropdownColor: AppTheme.surface,
                  icon: const Icon(Icons.arrow_drop_down, color: AppTheme.gold, size: 18),
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppTheme.gold),
                  items: const [
                    DropdownMenuItem(value: 'PKR', child: Text('🇵🇰 Rs')),
                    DropdownMenuItem(value: 'USD', child: Text('🇺🇸 $')),
                    DropdownMenuItem(value: 'GBP', child: Text('🇬🇧 £')),
                    DropdownMenuItem(value: 'AUD', child: Text('🇦🇺 A$')),
                  ],
                  onChanged: (val) {
                    if (val != null) currency.setCurrency(val);
                  },
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),

          // Cart Button
          Stack(
            alignment: Alignment.center,
            children: [
              IconButton(
                icon: const Icon(Icons.shopping_bag_outlined, color: AppTheme.textLight),
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const CartScreen()),
                  );
                },
              ),
              if (cart.totalItemCount > 0)
                Positioned(
                  top: 6,
                  right: 6,
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: const BoxDecoration(
                      color: AppTheme.gold,
                      shape: BoxShape.circle,
                    ),
                    constraints: const Size(18, 18),
                    child: Center(
                      child: Text(
                        '${cart.totalItemCount}',
                        style: const TextStyle(
                          color: AppTheme.bg,
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: _screens[_currentIndex],
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: AppTheme.border, width: 1)),
        ),
        child: BottomNavigationBar(
          currentIndex: _currentIndex,
          onTap: (index) => setState(() => _currentIndex = index),
          items: const [
            BottomNavigationBarItem(
              icon: Icon(Icons.restaurant_menu),
              label: 'Menu',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.delivery_dining),
              label: 'Track Order',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.calendar_month),
              label: 'Reserve',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.person_outline),
              label: 'Account',
            ),
          ],
        ),
      ),
    );
  }
}
