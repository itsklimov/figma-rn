import React from 'react';
import { ImageSourcePropType, StyleSheet, Text, View } from 'react-native';

interface VisitsProps {
  /** Default: "История визитов" */
  title: string;
  /** Default: "Марина" */
  name: string;
  /** Default: "Пн, 20 июл 18:00" */
  dateTime: string;
  /** Default: "Маникюр" */
  service: string;
  /** Default: "5000 ₽" */
  price: string;
}

interface CardArhiveVisitProps {
  name: string;
  dateTime: string;
  dateTime1: string;
  service: string;
}

const CARDARHIVEVISITS_DATA = [
  {
    "name": "Анастасия",
    "dateTime": "Пн, 6 июл",
    "dateTime1": "18:00",
    "service": "Маникюр "
  },
  {
    "name": "Анастасия",
    "dateTime": "Пн, 1 июл",
    "dateTime1": "18:00",
    "service": "Маникюр ",
    "ratingValue": "5"
  },
  {
    "name": "Анастасия",
    "dateTime": "Пн, 1 июл",
    "dateTime1": "18:00",
    "service": "Маникюр ",
    "ratingValue": "1"
  }
];

interface BackIconProps {
  /** Default: "" */
  vector39Stroke: ImageSourcePropType;
}

function BackIcon({ vector39Stroke }: BackIconProps) {
  return (
    <View style={styles.backIcon}>
      <View style={styles.arrowIcon}>
        <View style={styles.arrowBackground} />
        <Image
          source={vector39Stroke}
          style={styles.vector39Stroke}
          accessibilityRole="image"
        />
      </View>
    </View>
  );
}

interface PhotoProps {
  /** Default: "ee1792103b34034c62089ac267b43f0745065686" */
  marina: ImageSourcePropType;
}

function Photo({ marina = "ee1792103b34034c62089ac267b43f0745065686" }: PhotoProps) {
  return (
    <Image
      source={marina}
      style={styles.marina}
      accessibilityRole="image"
    />
  );
}

interface Frame1000001121Props {
  /** Default: "" */
  vector: ImageSourcePropType;
}

function Frame1000001121({ vector }: Frame1000001121Props) {
  return (
    <View style={styles.frame1000001121}>
      <Image
        source={vector}
        style={styles.vector}
        accessibilityRole="image"
      />
      <Image
        source={vector}
        style={styles.vector}
        accessibilityRole="image"
      />
      <Image
        source={vector}
        style={styles.vector}
        accessibilityRole="image"
      />
      <Image
        source={vector}
        style={styles.vector}
        accessibilityRole="image"
      />
      <Image
        source={vector}
        style={styles.vector}
        accessibilityRole="image"
      />
    </View>
  );
}

function Button({}) {
  return (
    <View style={styles.button} />
  );
}

interface CardArhiveVisitProps {
  /** Default: "Анастасия" */
  name: string;
  /** Default: "Пн, 6 июл" */
  dateTime: string;
  /** Default: "18:00" */
  dateTime1: string;
  /** Default: "Маникюр " */
  service: string;
}

function CardArhiveVisit({ name = "Анастасия", dateTime = "Пн, 6 июл", dateTime1 = "18:00", service = "Маникюр " }: CardArhiveVisitProps) {
  return (
    <View style={styles.cardArhiveVisit}>
      <View style={styles.avatarMaster}>
        <Photo marina={marina} />
      </View>
      <View style={styles.content}>
        <Text style={styles.name}>{name}</Text>
        <View style={styles.dateAndTime}>
          <Text style={styles.date}>{dateTime}</Text>
          <Text style={styles.time}>{dateTime1}</Text>
        </View>
        <Text style={styles.service}>{service}</Text>
      </View>
      <View style={styles.ratingAndAction}>
        <View style={styles.rating}>
          <View style={styles.reviewsText} />
        </View>
        <Button />
      </View>
    </View>
  );
}

export function Visits({ title = "История визитов", name = "Марина", dateTime = "Пн, 20 июл 18:00", service = "Маникюр", price = "5000 ₽" }: VisitsProps) {
  return (
    <View style={styles.visits}>
      <View style={styles.header}>
        <BackIcon vector39Stroke={vector39Stroke} />
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.cardVisit}>
          <View style={styles.avatarContent}>
            <View style={styles.avatarMaster}>
              <Photo marina={marina} />
            </View>
            <View style={styles.visitDetails}>
              <View style={styles.content}>
                <View style={styles.dateAndTime}>
                  <Text style={styles.name}>{name}</Text>
                </View>
                <Text style={styles.dateAndTime}>{dateTime}</Text>
                <Text style={styles.service}>{service}</Text>
              </View>
              <View style={styles.priceStatus}>
                <Text style={styles.price}>{price}</Text>
              </View>
            </View>
          </View>
          <Frame1000001121 vector={vector} />
        </View>
        <View style={styles.block}>
          {CARDARHIVEVISITS_DATA.map((item, index) => (
            <CardArhiveVisit key={index} {...item} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  visits: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    paddingTop: 56,
    paddingRight: 12,
    paddingBottom: 115,
    paddingLeft: 12,
    flex: 1,
    borderRadius: 16, // TODO: map to theme
    backgroundColor: '#f7f7f7', // TODO: map to theme
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 87,
    paddingRight: 30,
    width: 351,
    height: 30,
  },
  title: {
    width: 291,
    height: 25,
    fontFamily: 'SF Pro',
    fontSize: 20,
    fontWeight: '590',
    lineHeight: 25,
    letterSpacing: 0.38,
    textAlign: 'center',
    color: '#17171a', // TODO: map to theme
  },
  content: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
    flex: 1,
    height: 64,
  },
  cardVisit: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 21,
    paddingTop: 12,
    paddingRight: 12,
    paddingBottom: 12,
    paddingLeft: 12,
    width: '100%',
    height: 248,
    borderRadius: 20, // TODO: map to theme
    backgroundColor: '#ffffff', // TODO: map to theme
  },
  avatarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    height: 104,
  },
  avatarMaster: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    width: 65,
    height: 65,
    borderRadius: 7.5, // TODO: map to theme
    backgroundColor: '#ffffff', // TODO: map to theme
  },
  visitDetails: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    gap: 12,
    flex: 1,
    height: 78,
  },
  dateAndTime: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    width: '100%',
    height: 16,
  },
  name: {
    width: 79,
    height: 20,
    fontFamily: 'SF Pro',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    letterSpacing: -0.5,
    color: '#5a5a5b', // TODO: map to theme
  },
  service: {
    width: 68,
    height: 20,
    fontFamily: 'SF Pro',
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 20,
    letterSpacing: -0.24,
    color: '#5a5a5b', // TODO: map to theme
  },
  priceStatus: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 10,
    width: 57,
    height: 22,
  },
  price: {
    width: 57,
    height: 22,
    fontFamily: 'SF Pro',
    fontSize: 17,
    fontWeight: '400',
    lineHeight: 22,
    letterSpacing: -0.41,
    color: '#5a5a5b', // TODO: map to theme
  },
  block: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 20,
    paddingTop: 16,
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 16,
    width: '100%',
    height: 339,
    borderRadius: 20, // TODO: map to theme
    backgroundColor: '#ffffff', // TODO: map to theme
  },
});
