import 'package:flutter/material.dart';

class CurrencyProvider extends ChangeNotifier {
  String _currencyCode = 'PKR'; // PKR, USD, GBP, AUD
  String _currencySymbol = 'Rs ';
  double _exchangeRate = 1.0; // multiplier from PKR base

  String get currencyCode => _currencyCode;
  String get currencySymbol => _currencySymbol;

  void setCurrency(String code) {
    _currencyCode = code;
    switch (code) {
      case 'USD':
        _currencySymbol = r'$';
        _exchangeRate = 0.0036;
        break;
      case 'GBP':
        _currencySymbol = '£';
        _exchangeRate = 0.0028;
        break;
      case 'AUD':
        _currencySymbol = r'A$';
        _exchangeRate = 0.0054;
        break;
      default: // PKR
        _currencySymbol = 'Rs ';
        _exchangeRate = 1.0;
        break;
    }
    notifyListeners();
  }

  String formatPrice(double priceInPkr) {
    final converted = priceInPkr * _exchangeRate;
    if (_currencyCode == 'PKR') {
      return 'Rs ${converted.toInt().toString().replaceAllMapped(RegExp(r'(d{1,3})(?=(d{3})+(?!d))'), (Match m) => '${m[1]},')}';
    } else {
      return '$_currencySymbol${converted.toStringAsFixed(2)}';
    }
  }
}
