/** Shared menu data — uses the café's own photos from ember-and-brew/public/images/ */
const img = (filename) => `/images/${filename}`;

const menuItems = [
  { name: 'Espresso', description: 'Bold, concentrated shot of our house blend. Rich crema, chocolate finish.', price: 3.50, category: 'Coffee', image: img('expresso.jpeg'), featured: true, popular: true },
  { name: 'Cappuccino', description: 'Equal parts espresso, steamed milk, and velvety foam. Classic comfort.', price: 4.50, category: 'Coffee', image: img('Cappuccino.jpeg'), featured: true, popular: true },
  { name: 'White Pasta', description: 'Double ristretto with silky microfoam. Smooth, intense, no fluff.', price: 5.00, category: 'Coffee', image: img('creme.jpeg') },
  { name: 'Cold Brew', description: '16-hour steeped cold extraction. Smooth, low-acid, naturally sweet.', price: 4.75, category: 'Coffee', image: img('cold brew.jpeg'), popular: true },
  { name: 'Mocha', description: 'Espresso meets house-made dark chocolate sauce and steamed milk.', price: 5.50, category: 'Coffee', image: img('mocha.jpeg') },
  { name: 'Matcha Latte', description: 'Ceremonial-grade Uji matcha whisked with oat milk. Earthy, calm.', price: 5.25, category: 'Coffee', image: img('matcha.jpeg') },
  { name: 'Butter Croissant', description: '72-hour laminated dough, Normandy butter. Flaky, golden, perfect.', price: 3.75, category: 'Pastries', image: img('butter croissant.jpeg'), featured: true, popular: true },
  { name: 'Almond Danish', description: 'Flaky pastry filled with frangipane, topped with sliced almonds.', price: 4.25, category: 'Pastries', image: img('Avacado toast.jpeg') },
  { name: 'Blueberry Muffin', description: 'Tender crumb loaded with wild blueberries and a streusel crown.', price: 3.50, category: 'Pastries', image: img('blueberry muffin.jpeg') },
  { name: 'Cinnamon Roll', description: 'Slow-fermented dough, brown sugar-cinnamon swirl, cream cheese glaze.', price: 4.50, category: 'Pastries', image: img('cinnamon rolls.jpeg'), popular: true },
  { name: 'Cheese Sandwich', description: 'Sourdough, smashed hass avocado, chili flakes, pickled onion, micro greens.', price: 8.50, category: 'Sandwiches', image: img('cheese sandwich.jpeg'), featured: true, popular: true },
  { name: 'Turkey Club', description: 'Roasted turkey, applewood bacon, heirloom tomato, aioli on ciabatta.', price: 9.75, category: 'Sandwiches', image: img('turkey club sandwich.jpeg') },
  { name: 'Grilled Cheese', description: 'Triple cheese melt — gruyere, fontina, sharp cheddar on sourdough.', price: 7.50, category: 'Sandwiches', image: img('grilled cheese sandwich.jpeg') },
  { name: 'Caprese Panini', description: 'Fresh mozzarella, roasted tomato, basil pesto, balsamic on focaccia.', price: 9.25, category: 'Sandwiches', image: img('caprese panini.jpeg') },
  { name: 'Caesar Salad', description: 'Crisp romaine, house-made dressing, parmesan crisps, garlic croutons.', price: 8.75, category: 'Salads', image: img('caser saald.jpeg') },
  { name: 'Harvest Bowl', description: 'Roasted sweet potato, quinoa, kale, pickled beet, tahini dressing.', price: 10.50, category: 'Salads', image: img('harvest salad.jpeg'), popular: true },
  { name: 'Greek Salad', description: 'Cucumber, tomato, kalamata, red onion, feta, oregano vinaigrette.', price: 9.00, category: 'Salads', image: img('greek saald.jpeg') },
  { name: 'Tiramisu', description: 'Espresso-soaked ladyfingers, mascarpone cream, cocoa dust. House recipe.', price: 7.50, category: 'Desserts', image: img('tiramusu.jpeg'), featured: true },
  { name: 'Chocolate Lava Cake', description: 'Warm dark chocolate fondant with a molten center. Vanilla bean cream.', price: 8.25, category: 'Desserts', image: img('cocalate lava.jpeg'), popular: true },
  { name: 'Creme Brulee', description: 'Madagascar vanilla custard with a caramelized sugar crust. Crackling perfection.', price: 7.75, category: 'Desserts', image: img('creme brulee.jpeg') },
  { name: 'Fresh Orange Juice', description: 'Hand-pressed Valencia oranges. No added sugar, pure sunshine.', price: 4.50, category: 'Drinks', image: img('orange juice.jpeg') },
  { name: 'Iced Lemonade', description: 'House-made lemon syrup with sparkling water and fresh mint.', price: 4.00, category: 'Drinks', image: img('iced lemonade.jpeg') },
  { name: 'Sparkling Water', description: 'Italian mineral water, served ice-cold with a citrus twist.', price: 2.50, category: 'Drinks', image: img('sparkiling Water.jpeg') },
  { name: 'Chai Latte', description: 'Spiced black tea simmered with ginger, cardamom, cinnamon, steamed milk.', price: 4.75, category: 'Drinks', image: img('chai latte.jpeg') }
];

module.exports = menuItems;