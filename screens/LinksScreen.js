import React from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableHighlight,
  AppRegistry,
  Dimensions,
  NativeModules,
  View,
  Button,
  Modal,
} from 'react-native';
import { ExpoLinksView } from '@expo/samples';
import { ImagePicker } from 'expo';
import { Permissions } from 'expo';
import * as firebase from 'firebase';
import uuid from 'uuid';
import { YellowBox } from 'react-native';
import _ from 'lodash';
import * as Progress from 'react-native-progress';

// this is a stupid side effect of firebase. press f to pay respects.
YellowBox.ignoreWarnings(['Setting a timer','Possible Unhandled Promise']);
const _console = _.clone(console);
console.warn = message => {
  if (message.indexOf('Setting a timer') <= -1) {
    _console.warn(message);
  }
};
//import Camera from 'react-native-camera';
//import ImagePicker from 'react-native-image-picker'

const firebaseConfig = {
  apiKey: "AIzaSyDgDr5YGvNjP25HTlpf5qxWxC5ic0ozrvA",
  authDomain: "paper-panacea.firebaseapp.com",
  databaseURL: "paper-panacea.firebaseio.com",
  storageBucket: "paper-panacea.appspot.com"
};

firebase.initializeApp(firebaseConfig);

export default class LinksScreen extends React.Component {
  static navigationOptions = {
    title: 'Analyze',
  };

  state = {
    photo: null,
    photo_meta: null,
    lastJobId: null,
    currJobId: null,
    uploading: false,
    modalVisible: false,
    analysisDone: false,
    curr_progress: 0.1,
    outputPolled: false,
    curr_progress_info: "10%",
    analysisTitleTextState: "Beginning Analysis...",
    analysisJobIdInfoState: "JOB ID: ",
    resultButtonVisible: false,
  }

  async camera_open() {
      const { Permissions } = Expo;
      console.log("Attempting to interface with camera.");
      const { status } =  Permissions.getAsync(Permissions.CAMERA, Permissions.CAMERA_ROLL);
      if (status !== 'granted') {
        //alert('Panacea requires the following permissions to send samples for analysis.');
        const { status, expires, permissions } = Permissions.askAsync(Permissions.CAMERA, Permissions.CAMERA_ROLL)
        
      } 
      console.log("Launching camera.");
      let imout = await ImagePicker.launchCameraAsync({ allowsEditing: true, exif: true, aspect: [1,1] });
      console.log(imout);
      if (!imout["cancelled"]) {
        this.setState({ photo: imout, photo_meta:imout.exif })
        console.log("Sending image data to remote server...");
        this.uploadImageAsync();
      }
      
  }

  async gallery_open() {
      const { Permissions } = Expo;
      console.log("Attempting to interface with camera.");
      const { status } =  Permissions.getAsync(Permissions.CAMERA, Permissions.CAMERA_ROLL);
      if (status !== 'granted') {
        //alert('Panacea requires the following permissions to send samples for analysis.');
        const { status, expires, permissions } = Permissions.askAsync(Permissions.CAMERA, Permissions.CAMERA_ROLL)
        
      } 

      console.log("Launching gallery.");
      let result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (!result["cancelled"]) {
        this.setState({ photo: result, photo_meta:result.exif })
        console.log(result);
        console.log("Sending image data to remote server...");
        this.uploadImageAsync();
      }
  }

  resetStatusIndicators() {
    this.state.resultButtonVisible = false;
    this.state.curr_progress = 0.1;
    this.state.curr_progress_info = "10%";
    this.state.analysisTitleTextState = "Beginning Analysis...";
  }

  setModalVisible(visible) {
    this.resetStatusIndicators();
    this.setState({modalVisible: visible});
    this.pollOutput();
  }

  resultLoader() {
    this.setModalVisible(!this.state.modalVisible);
    this.props.navigation.navigate('Home');
  }

  _jobStatusModal = () => {
    return (
      <Modal
          animationType="slide"
          transparent={false}
          visible={this.state.modalVisible}
          onRequestClose={() => {
            Alert.alert('Modal has been closed.');
          }}>
          <View style={{marginTop: 22, marginHorizontal:25, alignItems:'center',justifyContent:'center'}}>
            <View>
              <View style={styles.objectCenter}>
                <Text style={styles.analysisTitleText}> { this.state.analysisTitleTextState } </Text>
              </View>
              <View style={styles.center}>
                <Progress.Bar progress={ this.state.curr_progress } color="#841584" width={200}/>
                <View style={styles.objectSpacer}>
                  <Text> {this.state.curr_progress_info} </Text>
                </View>
              </View>
              <View style={styles.center}>
                <Text style={styles.jobText}>{ this.state.analysisJobIdInfoState } {this.state.lastJobId} </Text>
              </View>

              <View style={styles.closeAnalysisButton}>
                { this.state.resultButtonVisible &&
                <View style={styles.newSampleButton}>
                    <Button 
                      size="lg"
                      onPress={() => {
                        this.resultLoader();
                      }}
                      title="See results"
                      color="#a4c400"
                      accessibilityLabel="View results."
                    />
                </View>
                }
                <View style={styles.newSampleButton}>
                  <Button 
                    size="lg"
                    onPress={() => {
                      this.setModalVisible(!this.state.modalVisible);
                    }}
                    title="Close"
                    color="#888"
                    accessibilityLabel="Exit analysis page."
                  />
                </View>
              </View>
            </View>
          </View>
        </Modal>
    );
  };

  // this could also be like loading for the paper analysis stuff
  // the possibilities are endless
  // jk they're definitely not
  _maybeRenderUploadingOverlay = () => {
    if (this.state.uploading) {
      return (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              //backgroundColor: 'rgba(0,0,0,0.4)',
              alignItems: 'center',
              justifyContent: 'center',
            },
          ]}>
          <View
            style={[
              {
                backgroundColor: 'rgba(0,0,0,0.1)',
                height: 100,
                width: 100,
                borderRadius: 10,
                borderColor: "#fff",
                borderWidth: 1,
                alignItems: 'center',
                justifyContent: 'center',
              },
            ]}>
            <ActivityIndicator color="#333" animating size="large" />
          </View>
        </View>
      );
    }
  };
  
  async pollOutput() {
    // alright, this is the big one
    if (!this.state.outputPolled) {
      const delay = ms => new Promise(res => setTimeout(res, ms));
      await delay(10000);
      const x = await firebase
        .storage()
        .ref('data/'+this.state.lastJobId).child("hist.csv").getMetadata();
      console.log(x);
      this.state.curr_progress = 0.4;
      this.state.curr_progress_info = "40%";
      console.log("updated progress info");
      this.state.currJobId = this.state.lastJobId;
      this.state.analysisTitleTextState = "Calibrating Data...";
      this.forceUpdate();
      await delay(5000);
      const y = await firebase
        .storage()
        .ref('data/'+this.state.lastJobId).child("out.txt").getMetadata();
      if (this.state.curr_progress != 1) {
        this.state.curr_progress = 1;
        this.state.curr_progress_info = "100%";
        console.log("finalized progress info");
        this.state.analysisTitleTextState = "Done!";
        this.state.resultButtonVisible = true;
        this.state.outputPolled = true;
        this.forceUpdate();
      }
    } 
  }

  async uploadImageAsync() {
    // Why are we using XMLHttpRequest? See:
    // https://github.com/expo/expo/issues/2402#issuecomment-443726662
    this.setState({ uploading: true });
    const uri = this.state.photo.uri;
    const exif = this.state.photo_meta;
    
    const blob = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = function() {
        resolve(xhr.response);
      };
      xhr.onerror = function(e) {
        console.log(e);
        reject(new TypeError('Network request failed'));
      };
      xhr.responseType = 'blob';
      xhr.open('GET', uri, true);
      xhr.send(null);
    });

    const qid = uuid.v4();
    // important for fetching output without user profile mapping
    this.state.lastJobId = qid;
    this.state.outputPolled = false;

    const ref = firebase
      .storage()
      .ref('images').child(qid);
    const snapshot = await ref.put(blob);

    // gallery images are not guaranteed to give us all the data :( press f to pay respects 
    if (typeof(exif) != "undefined") {
      const ref_meta = firebase
        .database()
        .ref('samples').child(qid);
      const snapshot_meta = await ref_meta.set(JSON.parse(JSON.stringify(exif)));
    }
      
    // We're done with the blob, close and release it
    blob.close();
    
    this.setState({ uploading: false });
    this.setModalVisible(true);

    //alert('full sent like literally all your personal information to a database haha lol');
    return await snapshot.ref.getDownloadURL();
  }


  render() {
    return (
      <ScrollView style={styles.container}>
        
        <View style={styles.analysisInfoBox}>
          <Text style={styles.analysisInfoText}>
            Place step-by-step information to conduct analysis here.
          </Text>
        </View>

        { this._maybeRenderUploadingOverlay() }
        { this._jobStatusModal() }

        <View style={styles.actionPanel}>
          <View style={styles.newSampleButton}>
            <Button 
              size="lg"
              onPress={this.camera_open.bind(this)}
              title="Record New Sample"
              color="#841584"
              accessibilityLabel="Take a photo of a test for analysis."
            />
          </View>

          <View style={styles.newSampleButton}>
            <Button 
              size="lg"
              onPress={this.gallery_open.bind(this)}
              title="Choose Sample from Camera Roll"
              color="#888"
              accessibilityLabel="Choose a photo from your gallery for analysis."
            />
          </View>
        </View>
        

      </ScrollView>

    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 15,
    backgroundColor: '#fff',
  },
  analysisInfoBox: {
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginTop: 10,
    marginHorizontal:30,
    height: 100,
    borderRadius:10,
    borderWidth: 1,
    borderColor: '#fff',
  },
  analysisInfoText: {
    fontSize: 18,
    paddingVertical:20,
    paddingHorizontal:20,
    color: 'rgba(0,0,0,0.4)',
  },
  newSampleButton: {
    paddingHorizontal:38,
    marginTop:12,
  },
  actionPanel: {
    marginTop:300,
  },
  analysisTitleText: {
    fontSize: 30,
    fontWeight: 'bold',
    marginTop: 45,
    marginBottom: 35,
  },
  center: {
    alignItems:'center',
    justifyContent:'center',
    display: 'flex',
    flexDirection: 'row',
    fontSize: 12,
  },
  objectSpacer: {
    marginLeft: 16,
  },
  objectCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeAnalysisButton: {
    flex: 1,
    justifyContent: 'flex-end',
    marginBottom: 40,
    width:370
  },
  jobText: {
    fontSize: 12,
    color: 'rgba(0,0,0,0.4)',
    marginTop: 13,
    marginBottom: 45
  }
});
