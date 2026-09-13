import 'package:flutter/material.dart';
import '../config/app_theme.dart';
import '../services/api_service.dart';

class ReservationScreen extends StatefulWidget {
  const ReservationScreen({Key? key}) : super(key: key);

  @override
  State<ReservationScreen> createState() => _ReservationScreenState();
}

class _ReservationScreenState extends State<ReservationScreen> {
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  int _guests = 2;
  String _date = '2026-09-14';
  String _time = '19:30';
  bool _isBooking = false;
  bool _isSuccess = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: _isSuccess
            ? Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 40),
                  child: Column(
                    children: [
                      const Icon(Icons.check_circle_outline, size: 70, color: AppTheme.gold),
                      const SizedBox(height: 16),
                      const Text('Table Requested!', style: TextStyle(fontFamily: 'Playfair Display', fontSize: 24, fontWeight: FontWeight.bold, color: AppTheme.textLight)),
                      const SizedBox(height: 8),
                      const Text('We have reserved your table. A confirmation SMS will be sent to your phone shortly.', textAlign: TextAlign.center, style: TextStyle(color: AppTheme.textMuted)),
                      const SizedBox(height: 24),
                      ElevatedButton(
                        onPressed: () => setState(() => _isSuccess = false),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.gold,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                        ),
                        child: const Text('Book Another Table', style: TextStyle(color: AppTheme.bg, fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                ),
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Reserve a Table', style: TextStyle(fontFamily: 'Playfair Display', fontSize: 24, fontWeight: FontWeight.bold, color: AppTheme.textLight)),
                  const SizedBox(height: 4),
                  const Text('Enjoy an artisan dining experience in our luxury ambient lounge.', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
                  const SizedBox(height: 20),

                  // Guest Counter
                  const Text('Number of Guests', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppTheme.gold)),
                  const SizedBox(height: 8),
                  Row(
                    children: [1, 2, 4, 6, 8].map((g) {
                      final isSel = _guests == g;
                      return GestureDetector(
                        onTap: () => setState(() => _guests = g),
                        child: Container(
                          margin: const EdgeInsets.only(right: 8),
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                          decoration: BoxDecoration(
                            color: isSel ? AppTheme.gold : AppTheme.surface,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: isSel ? AppTheme.gold : AppTheme.border),
                          ),
                          child: Text('$g People', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: isSel ? AppTheme.bg : AppTheme.textLight)),
                        ),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 16),

                  _buildInput(_nameCtrl, 'Full Name', Icons.person),
                  const SizedBox(height: 10),
                  _buildInput(_phoneCtrl, 'Phone Number', Icons.phone, keyboardType: TextInputType.phone),
                  const SizedBox(height: 10),
                  _buildInput(_emailCtrl, 'Email Address', Icons.email, keyboardType: TextInputType.emailAddress),
                  const SizedBox(height: 10),
                  _buildInput(_notesCtrl, 'Special Requests (e.g. Birthday, Window Table)', Icons.note, maxLines: 2),
                  const SizedBox(height: 24),

                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      onPressed: _isBooking ? null : _handleBooking,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.gold,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                      child: _isBooking
                          ? const CircularProgressIndicator(color: AppTheme.bg)
                          : const Text('Confirm Table Reservation', style: TextStyle(color: AppTheme.bg, fontWeight: FontWeight.bold, fontSize: 15)),
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _buildInput(TextEditingController ctrl, String label, IconData icon, {TextInputType? keyboardType, int maxLines = 1}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.border),
      ),
      child: TextField(
        controller: ctrl,
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

  Future<void> _handleBooking() async {
    if (_nameCtrl.text.trim().isEmpty || _phoneCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please provide your name and phone number')));
      return;
    }

    setState(() => _isBooking = true);
    await ApiService.bookTable(
      name: _nameCtrl.text.trim(),
      phone: _phoneCtrl.text.trim(),
      email: _emailCtrl.text.trim(),
      date: _date,
      time: _time,
      guests: _guests,
      notes: _notesCtrl.text.trim(),
    );

    setState(() {
      _isBooking = false;
      _isSuccess = true;
    });
  }
}
