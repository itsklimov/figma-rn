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
  backIcon: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 8,
    paddingRight: 10,
    paddingBottom: 7,
    paddingLeft: 10,
    width: 30,
    height: 30,
    borderRadius: 100, // TODO: map to theme
  },
  arrowIcon: {
    alignItems: 'flex-start',
    width: 10,
    height: 15,
  },
  arrowBackground: {
    alignItems: 'flex-start',
    width: '100%',
    height: '100%',
    position: 'absolute',
    left: '0%',
    top: '0%',
    backgroundColor: '#c4c4c4', // TODO: map to theme
  },
  vector39stroke: {
    width: 8,
    height: 14,
    position: 'absolute',
    left: 1,
    top: 0,
    borderRadius: 0.6, // TODO: map to theme
    backgroundColor: '#858585', // TODO: map to theme
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
  photo: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    width: 89,
    height: 70,
    backgroundColor: '#ffffff', // TODO: map to theme
  },
  marina: {
    width: 89,
    height: 70,
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
  container74547: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingRight: 10,
    paddingLeft: 10,
    width: '100%',
    height: 99,
  },
  icon1293: {
    width: 56,
    height: 54,
    backgroundColor: '#f6f6f6', // TODO: map to theme
  },
  icon1294: {
    width: 56,
    height: 54,
    backgroundColor: '#f6f6f6', // TODO: map to theme
  },
  icon1295: {
    width: 56,
    height: 54,
    backgroundColor: '#f6f6f6', // TODO: map to theme
  },
  icon1296: {
    width: 56,
    height: 54,
    backgroundColor: '#f6f6f6', // TODO: map to theme
  },
  icon1297: {
    width: 56,
    height: 54,
    backgroundColor: '#f6f6f6', // TODO: map to theme
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
  cardArhiveVisit: {
    width: 311,
    height: 89,
    borderRadius: 16, // TODO: map to theme
    backgroundColor: '#f7f7f7', // TODO: map to theme
  },
  date: {
    width: 56,
    height: 16,
    fontFamily: 'SF Pro',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: '#5a5a5b', // TODO: map to theme
  },
  time: {
    width: 32,
    height: 16,
    fontFamily: 'SF Pro',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: '#5a5a5b', // TODO: map to theme
  },
  ratingAndAction: {
    width: 95,
    height: 65,
  },
  rating: {
    width: 29,
    height: 20,
  },
  reviewsText: {
    width: 7,
    height: 18,
  },
  button: {
    width: 95,
    height: 38,
    backgroundColor: '#ffffff', // TODO: map to theme
  },
  freeIconStarWeb9171511: {
    width: 20,
    height: 20,
    backgroundColor: '#ffffff', // TODO: map to theme
  },
  ratingValue: {
    width: 7,
    height: 18,
    fontFamily: 'SF Pro',
    fontSize: 13,
    fontWeight: '590',
    lineHeight: 18,
    letterSpacing: -0.08,
    color: '#17171a', // TODO: map to theme
  },
});