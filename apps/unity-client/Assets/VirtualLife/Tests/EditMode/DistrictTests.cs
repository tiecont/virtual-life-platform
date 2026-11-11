using NUnit.Framework;

namespace VirtualLife.Blockout.Tests
{
    public sealed class DistrictTests
    {
        [Test]
        public void BoundsKeepTheCapsuleInsideTheDistrict()
        {
            Assert.That(District.Clamp(100), Is.EqualTo(15.5f));
            Assert.That(District.Clamp(-100), Is.EqualTo(-15.5f));
        }

        [Test]
        public void InteractionRequiresProximity()
        {
            Assert.That(District.CanInteract(0, 0, 0, 2), Is.True);
            Assert.That(District.CanInteract(0, 0, 0, 3), Is.False);
        }
    }
}
