const hand = document.querySelector('.emoji.wave-hand');

document.addEventListener('DOMContentLoaded', function () {
  hand.addEventListener('mouseover', function () {
    hand.classList.add('wave');
  });

  hand.addEventListener('mouseout', function () {
    hand.classList.remove('wave');
  });
});
