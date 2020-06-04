// tslint:disable max-classes-per-file
import React from 'react';
import {
  ActionSheetIOS,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import * as Linking from 'expo-linking';
import * as ImagePicker from 'expo-image-picker';
import * as Permissions from 'expo-permissions';
import * as Contacts from 'expo-contacts';
import HeaderButtons from 'react-navigation-header-buttons';
import { NavigationScreenProps, NavigationScreenConfig } from 'react-navigation';
import { Ionicons } from '@expo/vector-icons';

import Colors from '../../constants/Colors';
import ContactDetailsList from './ContactDetailList';
import ContactsAvatar from './ContactsAvatar';
import * as ContactUtils from './ContactUtils';

const isIos = Platform.OS === 'ios';

async function getPermissionAsync(permission: Permissions.PermissionType) {
  const { status } = await Permissions.askAsync(permission);
  if (status !== 'granted') {
    Linking.openURL('app-settings:');
    return false;
  }
  return true;
}

interface State {
  contact?: Contacts.Contact;
  permission?: boolean;
  refreshing?: boolean;
}

export default class ContactDetailScreen extends React.Component<NavigationScreenProps, State> {
  static navigationOptions: NavigationScreenConfig<{}> = ({ navigation }) => ({
    title: 'Contacts',
    headerRight: (
      <HeaderButtons
        IconComponent={Ionicons}
        OverflowIcon={<Ionicons name="ios-more" size={23} color="blue" />}
        iconSize={23}
        color="blue">
        <HeaderButtons.Item
          title="share"
          iconName="md-share"
          onPress={async () => {
            const { params = {} } = navigation.state;
            Contacts.shareContactAsync(params.id, 'Call me :}');
          }}
        />
        {isIos && (
          <HeaderButtons.Item
            title="edit"
            iconName="md-copy"
            onPress={() => {
              const { params = {} } = navigation.state;
              ContactUtils.cloneAsync(params.id);
              navigation.goBack();
            }}
          />
        )}
      </HeaderButtons>
    ),
  });

  readonly state: State = {};

  async componentDidMount() {
    await this.checkPermissionAsync();
    await this.loadAsync();
  }

  checkPermissionAsync = async () => {
    const permission = await getPermissionAsync(Permissions.CONTACTS);
    this.setState({ permission });
  };

  get id() {
    const { params = {} } = this.props.navigation.state;
    return params.id;
  }

  deleteAsync = async () => {
    try {
      await Contacts.removeContactAsync(this.id);
      this.props.navigation.goBack();
    } catch ({ message }) {
      // tslint:disable-next-line no-console
      console.error(message);
    }
  };

  loadAsync = async () => {
    if (!this.state.permission) {
      return;
    }
    this.setState({ refreshing: true });
    const contact = await Contacts.getContactByIdAsync(this.id);

    this.setState({
      contact,
      refreshing: false,
    });
    // tslint:disable-next-line no-console
    console.log(contact);
  };

  get jobTitle() {
    const { contact } = this.state;
    const { jobTitle, department } = contact || { jobTitle: '', department: '' };
    if (!jobTitle || !department) {
      return jobTitle || department;
    }
    return `${jobTitle} - ${department}`;
  }

  get subtitles() {
    const { contact } = this.state;
    return [
      contact && contact.phoneticFirstName,
      contact && contact.nickname,
      contact && contact.maidenName,
      this.jobTitle,
      contact && contact.company,
    ].filter(item => !!item);
  }

  get links() {
    const { contact } = this.state;

    const phone = ContactUtils.getPrimary<Contacts.PhoneNumber>(
      (contact && contact.phoneNumbers) || []
    );
    const email = ContactUtils.getPrimary<Contacts.Email>((contact && contact.emails) || []);

    return [
      { icon: 'text', text: 'message', format: 'sms', uri: phone && phone.number },
      { icon: 'call', text: 'call', format: 'tel', uri: phone && phone.number },
      { icon: 'videocam', text: 'video', format: 'facetime', uri: email && email.email },
      { icon: 'mail', text: 'mail', format: 'mailto', uri: email && email.email },
      { icon: 'cash', text: 'pay', format: 'shoebox', uri: email && email.email },
    ];
  }

  get items(): Array<{
    title: string;
    data: any;
  }> {
    const { contact } = this.state;

    const items = [];
    for (const key of Object.keys(contact || {})) {
      const value = (contact as any)[key];
      if (Array.isArray(value) && value.length > 0) {
        const data = value.map(item => {
          let transform = {};
          switch (key) {
            case Contacts.Fields.Relationships:
              transform = {
                value: item.name,
              };
              break;
            case Contacts.Fields.PhoneNumbers:
              transform = {
                value: item.number,
                onPress: () => Linking.openURL(`tel:${item.number}`),
              };
              break;
            case Contacts.Fields.SocialProfiles:
              transform = {
                value: item.username,
                label: item.label || item.localizedService,
              };
              break;
            case Contacts.Fields.UrlAddresses:
              transform = {
                value: item.url,
                onPress: () => {
                  const webUrl = item.url.indexOf('://') === -1 ? 'http://' + item.url : item.url;

                  // tslint:disable-next-line no-console
                  console.log('open', item.url, webUrl);
                  Linking.openURL(webUrl);
                },
              };
              break;
            case Contacts.Fields.Dates:
              transform = {
                value: ContactUtils.parseDate(item).toDateString(),
              };
              break;
            case Contacts.Fields.Emails:
              transform = {
                value: item.email,
                onPress: () => Linking.openURL(`mailto:${item.email}`),
              };
              break;
            case Contacts.Fields.Addresses:
              {
                const address = ContactUtils.parseAddress(item);
                const targetUriAdress = encodeURI(address);
                transform = {
                  value: address,
                  onPress: () =>
                    Linking.openURL(
                      Platform.select({
                        ios: 'http://maps.apple.com/maps?daddr=' + targetUriAdress,
                        android: 'http://maps.google.com/maps?daddr=' + targetUriAdress,
                      })
                    ),
                };
              }
              break;
            case Contacts.Fields.InstantMessageAddresses:
              transform = {
                value: item.username,
              };
              break;
            default:
              break;
          }
          return {
            type: key,
            ...item,
            ...transform,
          };
        });
        items.push({
          title: ContactUtils.parseKey(key),
          data,
        });
      }
    }
    return items;
  }

  onPressImage = async () => {
    if (!isIos) {
      return;
    }

    const sheetOptions = [
      {
        name: 'Take New Photo',
        action: this._takePhoto,
      },
      {
        name: 'Select New Photo',
        action: this._selectPhoto,
      },
      { name: 'Cancel' },
    ];
    const cancelButtonIndex = sheetOptions.length - 1;

    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: sheetOptions.map(({ name }) => name),
        cancelButtonIndex,
      },
      buttonIndex => {
        if (buttonIndex !== cancelButtonIndex) {
          const { action } = sheetOptions[buttonIndex];
          // tslint:disable-next-line no-console
          console.log(buttonIndex, sheetOptions[buttonIndex]);
          if (action) {
            action();
          }
        }
        // Do something here depending on the button index selected
      }
    );
  };

  _takePhoto = async () => {
    const permission = await getPermissionAsync(Permissions.CAMERA);
    if (!permission) {
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
    });

    if (!result.cancelled) {
      this._setNewPhoto(result.uri);
    }
  };

  _setNewPhoto = async (uri: string) => {
    // console.log(this.id, this.state.contact, uri);
    try {
      await Contacts.updateContactAsync({
        [Contacts.Fields.ID]: this.id,
        [Contacts.Fields.Image]: uri,
      } as any);
    } catch ({ message }) {
      // tslint:disable-next-line no-console
      console.error(message);
    }

    this.loadAsync();
  };

  _selectPhoto = async () => {
    const permission = await getPermissionAsync(Permissions.CAMERA_ROLL);
    if (!permission) {
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [4, 3],
    });

    if (!result.cancelled) {
      this._setNewPhoto(result.uri);
    }
  };

  onPressItem = () => {
    Alert.alert('item pressed');
  };

  renderListHeaderComponent = () => {
    const { contact } = this.state;
    return (
      <View
        style={{
          paddingHorizontal: 36,
          paddingVertical: 16,
          flex: 1,
          alignItems: 'stretch',
          backgroundColor: Colors.greyBackground,
        }}>
        <View style={{ alignItems: 'center', marginBottom: 8 }}>
          <ContactsAvatar
            style={styles.image}
            onPress={this.onPressImage}
            name={(contact && contact.name) || ''}
            image={(contact && contact.image) as any}
          />
          <Text style={styles.name}>{contact && contact.name}</Text>

          {this.subtitles.map((subtitle, index) => (
            <Text key={index} style={styles.subtitle}>
              {subtitle}
            </Text>
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {this.links.map((linkedItem, index) => (
            <LinkedButton {...linkedItem} key={index} />
          ))}
        </View>
      </View>
    );
  };

  renderListFooterComponent = () => (
    <Text
      onPress={this.deleteAsync}
      style={{
        width: '100%',
        padding: 24,
        textAlign: 'center',
        justifyContent: 'center',
        alignItems: 'center',
        color: 'red',
      }}>
      Delete Contact
    </Text>
  );

  render() {
    const { contact, permission } = this.state;
    if (!permission || !contact) {
      return <View />;
    }

    return (
      <View style={styles.container}>
        {/*
        // @ts-ignore */}
        <ContactDetailsList
          refreshControl={
            <RefreshControl
              refreshing={this.state.refreshing || false}
              onRefresh={this.loadAsync}
            />
          }
          ListFooterComponent={this.renderListFooterComponent}
          ListHeaderComponent={this.renderListHeaderComponent}
          data={this.items}
          onPressItem={this.onPressItem}
        />
      </View>
    );
  }
}

class LinkedButton extends React.PureComponent<{
  uri?: string | null;
  format: string;
  text: string;
  icon: string;
}> {
  get enabled() {
    return !!this.props.uri;
  }

  get colors() {
    if (this.enabled) {
      return {
        color: 'white',
        backgroundColor: Colors.tintColor,
      };
    } else {
      return {
        color: 'gray',
        backgroundColor: 'transparent',
      };
    }
  }

  onPress = () => {
    Linking.openURL(`${this.props.format}:${this.props.uri}`);
  };

  render() {
    const SIZE = 40;
    const { color, backgroundColor } = this.colors;
    const { text, icon } = this.props;
    return (
      <TouchableOpacity disabled={!this.enabled} onPress={this.onPress}>
        <View
          style={{
            width: SIZE,
            aspectRatio: 1,
            marginBottom: 4,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(0,0,0,0.1)',
            borderRadius: SIZE / 2,
            backgroundColor,
            justifyContent: 'center',
            alignItems: 'center',
          }}>
          <Ionicons name={`ios-${icon}`} size={20} color={color} />
        </View>
        <Text style={{ fontSize: 10, color: backgroundColor, textAlign: 'center' }}>{text}</Text>
      </TouchableOpacity>
    );
  }
}

const styles = StyleSheet.create({
  button: {
    marginVertical: 10,
  },
  container: {
    flex: 1,
    alignItems: 'stretch',
  },
  contactRow: {
    marginBottom: 12,
  },
  image: {
    marginVertical: 16,
  },
  name: {
    fontSize: 24,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    opacity: 0.8,
    textAlign: 'center',
    fontSize: 16,
    marginBottom: 2,
  },
});
